import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album, AlbumLockedError, SpreadNotFoundError } from "../src/modules/album-composition/domain/album";
import { findTemplate } from "../src/modules/album-composition/domain/layout-template";
import { ReviewSession, ReviewClosedError } from "../src/modules/review-collaboration/domain/review-session";
import { Subscription } from "../src/modules/identity/domain/subscription";
import { Studio } from "../src/modules/identity/domain/studio";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { Photo, InvalidPhotoStateTransitionError } from "../src/modules/media-ingestion/domain/photo";

function makeAlbum(): Album {
  return Album.create({
    projectId: UniqueEntityId.create(),
    title: "Test album",
    spreads: [
      {
        templateId: "portrait-pair",
        placements: [
          { slotId: "left", photoId: "photo-a", crop: { x: 0, y: 0, width: 1, height: 1 } },
          { slotId: "right", photoId: "photo-b", crop: { x: 0, y: 0, width: 1, height: 1 } },
        ],
      },
      {
        templateId: "single-centred",
        placements: [
          { slotId: "centre", photoId: "photo-c", crop: { x: 0, y: 0, width: 1, height: 1 } },
        ],
      },
    ],
  });
}

describe("Album", () => {
  it("counts pages as two per spread", () => {
    const album = makeAlbum();
    assert.equal(album.spreadCount, 2);
    assert.equal(album.pageCount, 4);
    assert.equal(album.photoCount, 3);
  });

  it("refuses edits once approved", () => {
    const album = makeAlbum();
    album.approve();
    assert.throws(() => album.rename("New title"), AlbumLockedError);
    assert.throws(() => album.removeSpread(0), AlbumLockedError);
  });

  it("allows edits again after reopening", () => {
    const album = makeAlbum();
    album.approve();
    album.reopen();
    album.rename("Second pass");
    assert.equal(album.title, "Second pass");
  });

  it("rejects operations on spreads that do not exist", () => {
    const album = makeAlbum();
    assert.throws(() => album.reorderSpread(0, 9), SpreadNotFoundError);
    assert.throws(() => album.swapPhoto(7, "left", "x"), SpreadNotFoundError);
  });

  it("never leaves an album with zero spreads", () => {
    const album = makeAlbum();
    album.removeSpread(1);
    assert.throws(() => album.removeSpread(0), /at least one spread/);
  });

  it("carries photos across a template change instead of dropping them", () => {
    const album = makeAlbum();
    album.changeTemplate(0, "quad");
    const spread = album.spreads[0];
    assert.equal(spread?.placements.length, findTemplate("quad")?.slots.length);
    assert.equal(spread?.placements[0]?.photoId, "photo-a");
    assert.equal(spread?.placements[1]?.photoId, "photo-b");
  });

  it("resets the crop when a slot gets a different photo", () => {
    const album = makeAlbum();
    album.setCrop(0, "left", { x: 0.2, y: 0.2, width: 0.5, height: 0.5 });
    album.swapPhoto(0, "left", "photo-z");
    assert.deepEqual(album.spreads[0]?.placements[0]?.crop, { x: 0, y: 0, width: 1, height: 1 });
  });

  it("clamps a crop that would run off the edge of the frame", () => {
    const album = makeAlbum();
    album.setCrop(0, "left", { x: 0.9, y: 0.9, width: 0.5, height: 0.5 });
    const crop = album.spreads[0]?.placements[0]?.crop;
    assert.ok(crop);
    assert.ok(crop.x + crop.width <= 1.0001, `crop overflows: ${JSON.stringify(crop)}`);
    assert.ok(crop.y + crop.height <= 1.0001);
  });

  it("reorders spreads", () => {
    const album = makeAlbum();
    album.reorderSpread(0, 1);
    assert.equal(album.spreads[0]?.templateId, "single-centred");
  });
});

describe("ReviewSession", () => {
  it("only matches the token it was opened with", () => {
    const { session, token } = ReviewSession.open({
      albumId: UniqueEntityId.create(),
      clientName: "Maria",
    });
    assert.equal(session.matchesToken(token), true);
    assert.equal(session.matchesToken(`${token}x`), false);
    assert.notEqual(session.tokenHash, token, "the raw token must never be stored");
  });

  it("stops accepting comments once approved", () => {
    const { session } = ReviewSession.open({
      albumId: UniqueEntityId.create(),
      clientName: "Maria",
    });
    session.approve();
    assert.throws(
      () => session.addComment({ spreadIndex: 0, body: "late note", authorName: "Maria" }),
      ReviewClosedError,
    );
  });

  it("treats an elapsed link as expired", () => {
    const { session } = ReviewSession.open({
      albumId: UniqueEntityId.create(),
      clientName: "Maria",
      ttlDays: 1,
    });
    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    assert.equal(session.isExpired(later), true);
    assert.equal(session.isExpired(), false);
  });

  it("tracks which comments are still open", () => {
    const { session } = ReviewSession.open({
      albumId: UniqueEntityId.create(),
      clientName: "Maria",
    });
    const first = session.addComment({ spreadIndex: 0, body: "swap this", authorName: "Maria" });
    session.addComment({ spreadIndex: 1, body: "and this", authorName: "Maria" });
    assert.equal(session.openComments.length, 2);
    session.resolveComment(first.id);
    assert.equal(session.openComments.length, 1);
  });
});

describe("Subscription", () => {
  it("gives the trial exactly one album", () => {
    const subscription = Subscription.startTrial(UniqueEntityId.create());
    assert.equal(subscription.canCreateAlbum().allowed, true);
    subscription.recordAlbumCreated();
    assert.equal(subscription.canCreateAlbum().allowed, false);
  });

  it("resets usage when the billing period rolls over", () => {
    const subscription = Subscription.startTrial(UniqueEntityId.create());
    subscription.recordAlbumCreated();
    assert.equal(subscription.canCreateAlbum().allowed, false);

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 2);
    assert.equal(subscription.canCreateAlbum(nextMonth).allowed, true);
    assert.equal(subscription.albumsUsed, 0);
  });

  it("blocks album creation while payment is failing", () => {
    const subscription = Subscription.startTrial(UniqueEntityId.create());
    subscription.changePlan("STUDIO");
    subscription.markPastDue();
    const decision = subscription.canCreateAlbum();
    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? "", /card/i);
  });

  it("reports unlimited seats for Studio Pro", () => {
    const subscription = Subscription.startTrial(UniqueEntityId.create());
    subscription.changePlan("STUDIO_PRO");
    assert.equal(subscription.seatsRemaining(50), Number.POSITIVE_INFINITY);
  });
});

describe("Studio & members", () => {
  it("stores only the hash of an issued API key", () => {
    const { studio, apiKey } = Studio.create({ name: "S", ownerEmail: "a@b.co" });
    assert.ok(apiKey.startsWith("af_"));
    assert.notEqual(studio.apiKeyHash, apiKey);
    assert.equal(studio.apiKeyHash.length, 64);
  });

  it("invalidates the old key on rotation", () => {
    const { studio, apiKey } = Studio.create({ name: "S", ownerEmail: "a@b.co" });
    const firstHash = studio.apiKeyHash;
    const rotated = studio.rotateApiKey();
    assert.notEqual(rotated, apiKey);
    assert.notEqual(studio.apiKeyHash, firstHash);
  });

  it("refuses to silently demote the owner", () => {
    const owner = StudioMember.invite({
      studioId: UniqueEntityId.create(),
      email: "a@b.co",
      name: "Owner",
      role: "OWNER",
    });
    assert.throws(() => owner.changeRole("VIEWER"), /Transfer ownership/);
  });

  it("grants edit rights to owners and editors only", () => {
    const studioId = UniqueEntityId.create();
    const make = (role: "OWNER" | "EDITOR" | "VIEWER") =>
      StudioMember.invite({ studioId, email: "x@y.z", name: "X", role });
    assert.equal(make("OWNER").canEdit, true);
    assert.equal(make("EDITOR").canEdit, true);
    assert.equal(make("VIEWER").canEdit, false);
  });
});

describe("Photo lifecycle", () => {
  it("refuses to confirm the same upload twice", () => {
    const photo = Photo.requestUpload({
      projectId: UniqueEntityId.create(),
      studioId: UniqueEntityId.create(),
      fileName: "a.jpg",
      mimeType: "image/jpeg",
      byteSize: 100,
    });
    photo.markUploaded({ byteSize: 100 });
    assert.throws(() => photo.markUploaded({ byteSize: 100 }), InvalidPhotoStateTransitionError);
  });

  it("builds a storage key scoped to studio and project", () => {
    const studioId = UniqueEntityId.create();
    const projectId = UniqueEntityId.create();
    const photo = Photo.requestUpload({
      projectId,
      studioId,
      fileName: "shot.JPG",
      mimeType: "image/jpeg",
      byteSize: 100,
    });
    const key = photo.storageKey.toString();
    assert.ok(key.startsWith(`studios/${studioId.toString()}/projects/${projectId.toString()}/`));
    assert.ok(key.endsWith(".jpg"), `extension should be normalised: ${key}`);
  });
});
