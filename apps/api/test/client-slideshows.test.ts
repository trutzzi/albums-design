import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album } from "../src/modules/album-composition/domain/album";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { ListProjectPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import type { PhotoDimensionsDirectory } from "../src/shared-kernel/photo-dimensions";
import { DeleteProjectUseCase } from "../src/modules/media-ingestion/application/use-cases/delete-project/delete-project.use-case";
import { PickSession } from "../src/modules/review-collaboration/domain/pick-session";
import {
  DEFAULT_SLIDESHOW_TTL_DAYS,
  InvalidSlideshowSettingsError,
  SlideshowSession,
  SlideshowUnavailableError,
} from "../src/modules/review-collaboration/domain/slideshow-session";
import type { PickGateway } from "../src/modules/review-collaboration/application/ports/pick-gateway";
import { SlideshowSessionAdminUseCase } from "../src/modules/review-collaboration/application/use-cases/slideshow-session-admin.use-case";
import { SlideshowPortalUseCase } from "../src/modules/review-collaboration/application/use-cases/slideshow-portal.use-case";
import { ReviewCollaborationSlideshowPhotos } from "../src/modules/review-collaboration/infrastructure/gateways/slideshow-photo-source";
import { registerSlideshowRoutes } from "../src/modules/review-collaboration/interface/http/slideshow-routes";
import { ClientInvitationMailer } from "../src/modules/review-collaboration/application/services/client-invitation.mailer";
import { ClientLinkInvitations } from "../src/modules/review-collaboration/application/services/client-link-invitations";
import type { StudioContacts } from "../src/modules/review-collaboration/application/ports/delivery-gateway";
import type { ClientContactDirectory } from "../src/modules/review-collaboration/application/ports/client-contact";
import { SecretBox } from "../src/shared-kernel/secret-box";
import { NO_WATERMARKS, type PlanFeatureDirectory } from "../src/shared-kernel/plan-features";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import { silentLogger } from "../src/shared-kernel/logger";
import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryObjectStorage,
  InMemoryPhotoAnalysisRepository,
  InMemoryPhotoRepository,
  InMemoryPickSessionRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
  InMemorySlideshowSessionRepository,
} from "./support/in-memory";
import { RecordingLogger } from "./support/recording-logger";

const SECRET = "test-secret-test-secret-test-secret-123";
const ORIGIN = "https://app.example.test";
const DAY = 24 * 60 * 60 * 1000;

function placement(slotId: string, photoId: string) {
  return { slotId, photoId, crop: { x: 0, y: 0, width: 1, height: 1 }, treatment: "COLOR" as const };
}

async function world(options: { slideshowsOnPlan?: boolean } = {}) {
  const projectId = UniqueEntityId.create();
  const otherProjectId = UniqueEntityId.create();
  const studioId = UniqueEntityId.create();
  const photos = new InMemoryPhotoRepository();
  const storage = new InMemoryObjectStorage();
  // Counts URL signing, which is what a large shoot makes expensive.
  const signed: string[] = [];
  const presign = storage.presignGet.bind(storage);
  storage.presignGet = async (key: string, ttl?: number) => {
    signed.push(key);
    return presign(key, ttl);
  };

  async function addPhoto(fileName: string, options: { ready?: boolean; project?: UniqueEntityId } = {}) {
    const photo = Photo.requestUpload({
      projectId: options.project ?? projectId,
      studioId,
      fileName,
      mimeType: "image/jpeg",
      byteSize: 1000,
    });
    photo.markUploaded({ byteSize: 1000 });
    if (options.ready ?? true) photo.markDerivativesReady();
    await photos.save(photo);
    return photo.id.toString();
  }
  // The shoot, in file-name order: ids[0] … ids[4]. Saved out of order on purpose.
  const names = ["IMG_0010.jpg", "IMG_0002.jpg", "IMG_0030.jpg", "IMG_0001.jpg", "IMG_0020.jpg"];
  const byName = new Map<string, string>();
  for (const name of names) byName.set(name, await addPhoto(name));
  const ids = [...names].sort().map((name) => byName.get(name)!);
  // Still being processed: has no display copies, so it must never reach a client.
  const processing = await addPhoto("IMG_0005.jpg", { ready: false });
  const foreign = await addPhoto("IMG_0001.jpg", { project: otherProjectId });

  const gallery: Pick<PickGateway, "loadProject"> = {
    loadProject: async (id) =>
      id === projectId.toString()
        ? { id, name: "Elena & Radu", branding: { name: "Studio Lumina", accent: "#225588", logo: null } }
        : undefined,
  };
  const dimensions: PhotoDimensionsDirectory = {
    forProject: async () => new Map([[ids[0]!, { width: 4000, height: 6000 }]]),
  };
  const pickSessions = new InMemoryPickSessionRepository();
  const albums = new InMemoryAlbumRepository();
  const sessions = new InMemorySlideshowSessionRepository();
  const source = new ReviewCollaborationSlideshowPhotos(
    pickSessions,
    albums,
    photos,
    new ListProjectPhotosUseCase(photos, storage),
    dimensions,
  );

  const sent: EmailMessage[] = [];
  const sender: EmailSender = { id: "test", send: async (message) => void sent.push(message) };
  const remembered: { name?: string | undefined; email?: string | undefined }[] = [];
  const contacts: ClientContactDirectory = {
    forProject: async (id) => ({
      projectId: id,
      projectName: "Elena & Radu",
      name: "Elena",
      email: "elena@example.com",
    }),
    forAlbum: async () => undefined,
    remember: async (_projectId, contact) => void remembered.push(contact),
  };
  const studios: StudioContacts = {
    forProject: async () => ({ projectName: "Elena & Radu", ownerEmails: ["studio@example.ro"] }),
  };
  const invitations = new ClientLinkInvitations(
    new ClientInvitationMailer(sender),
    contacts,
    studios,
    ORIGIN,
    silentLogger,
  );
  const planFeatures: PlanFeatureDirectory = {
    forProject: async () => ({ ...NO_WATERMARKS, clientSlideshows: options.slideshowsOnPlan ?? true }),
  };
  const box = new SecretBox(SECRET);
  const admin = new SlideshowSessionAdminUseCase(
    sessions,
    source,
    gallery,
    box,
    () => new Date(),
    invitations,
    contacts,
    planFeatures,
  );
  const logger = new RecordingLogger();
  const portal = new SlideshowPortalUseCase(sessions, source, gallery, logger);

  async function submitPicks(photoIds: string[], submittedAt: Date) {
    const { session } = PickSession.open({ projectId, clientName: "Elena" });
    for (const id of photoIds) session.setShortlisted(id, true);
    session.goToFinal();
    session.submit();
    // Ordering between submissions is what matters, so pin it rather than racing the clock.
    (session as unknown as { props: { submittedAt: Date } }).props.submittedAt = submittedAt;
    await pickSessions.save(session);
  }

  async function addAlbum(spreads: string[][], options: { cover?: string; project?: UniqueEntityId } = {}) {
    const album = Album.create({
      projectId: options.project ?? projectId,
      title: "Elena & Radu",
      spreads: spreads.map((photoIds) => ({
        templateId: "single-centred",
        placements: photoIds.map((id, index) => placement(`slot-${index}`, id)),
      })),
    });
    if (options.cover) {
      album.setCover({
        layout: "photo",
        photoId: options.cover,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        title: "Elena & Radu",
        subtitle: "",
      });
    }
    await albums.save(album);
    return album;
  }

  return {
    projectId: projectId.toString(),
    otherProjectId,
    ids,
    processing,
    foreign,
    signed,
    removeFromShoot: (id: string) => photos.delete(UniqueEntityId.create(id)),
    emptyShoot: async () => {
      for (const id of [...ids, processing]) await photos.delete(UniqueEntityId.create(id));
    },
    sessions,
    source,
    admin,
    portal,
    logger,
    sent,
    remembered,
    box,
    submitPicks,
    addAlbum,
  };
}

describe("SlideshowSession", () => {
  const base = { projectId: UniqueEntityId.create(), clientName: "Elena", photoIds: ["a", "b"] };

  it("lasts 180 days, plays every 5 seconds with a fade, and starts unviewed", () => {
    const { session, token } = SlideshowSession.open({ ...base, source: "SHOOT" });
    assert.ok(token.length >= 30);
    assert.equal(DEFAULT_SLIDESHOW_TTL_DAYS, 180);
    assert.equal(session.daysLeft(), 180);
    assert.deepEqual(session.settings, { intervalSeconds: 5, transition: "FADE" });
    assert.equal(session.viewCount, 0);
    assert.equal(session.status, "ACTIVE");
  });

  it("only keeps the album id for an album slideshow", () => {
    assert.equal(SlideshowSession.open({ ...base, source: "SHOOT", albumId: "x" }).session.albumId, undefined);
    assert.equal(SlideshowSession.open({ ...base, source: "ALBUM", albumId: "x" }).session.albumId, "x");
  });

  it("refuses an interval outside 3–15 whole seconds, on creation and on change", () => {
    for (const intervalSeconds of [2, 16, 4.5]) {
      assert.throws(
        () => SlideshowSession.open({ ...base, source: "SHOOT", settings: { intervalSeconds } }),
        InvalidSlideshowSettingsError,
      );
    }
    const { session } = SlideshowSession.open({ ...base, source: "SHOOT" });
    assert.throws(() => session.updateSettings({ intervalSeconds: 1 }), InvalidSlideshowSettingsError);
    session.updateSettings({ transition: "NONE" });
    assert.deepEqual(session.settings, { intervalSeconds: 5, transition: "NONE" }, "a partial change keeps the rest");
  });

  it("stops playing once revoked or past its expiry", () => {
    const { session } = SlideshowSession.open({ ...base, source: "SHOOT", ttlDays: 1 });
    assert.doesNotThrow(() => session.assertViewable());
    assert.throws(() => session.assertViewable(new Date(Date.now() + 2 * DAY)), SlideshowUnavailableError);
    session.revoke();
    assert.throws(() => session.assertViewable(), /no longer available/);
  });
});

describe("where a slideshow's photos come from", () => {
  it("takes the whole shoot in shoot order", async () => {
    const w = await world();
    assert.deepEqual(await w.source.shootPhotos(w.projectId), w.ids);
  });

  it("takes the latest submitted picks, in shoot order rather than tap order", async () => {
    const w = await world();
    assert.equal(await w.source.submittedPicks(w.projectId), undefined, "nothing submitted yet");
    await w.submitPicks([w.ids[0]!], new Date("2026-01-01"));
    await w.submitPicks([w.ids[3]!, w.ids[1]!], new Date("2026-02-01"));
    assert.deepEqual(await w.source.submittedPicks(w.projectId), [w.ids[1], w.ids[3]]);
  });

  it("plays an album cover first, then spreads in order, without repeating the cover photo", async () => {
    const w = await world();
    const album = await w.addAlbum([[w.ids[2]!, w.ids[0]!], [w.ids[4]!]], { cover: w.ids[4]! });
    assert.deepEqual(await w.source.albumPhotos(w.projectId, album.id.toString()), [w.ids[4], w.ids[2], w.ids[0]]);
  });

  it("never reads another shoot's album, even by its id", async () => {
    const w = await world();
    const foreign = await w.addAlbum([[w.ids[0]!]], { project: w.otherProjectId });
    assert.equal(await w.source.albumPhotos(w.projectId, foreign.id.toString()), undefined);
    assert.equal(await w.source.albumPhotos(w.projectId, UniqueEntityId.create().toString()), undefined);
  });

  it("turns saved ids into display copies in play order, skipping photos that are gone", async () => {
    const w = await world();
    await w.removeFromShoot(w.ids[1]!);
    const slides = await w.source.slides(w.projectId, [w.ids[3]!, w.ids[1]!, w.ids[0]!]);
    assert.deepEqual(
      slides.map((s) => s.id),
      [w.ids[3], w.ids[0]],
    );
    assert.ok(
      slides.every((s) => s.previewUrl.endsWith("-preview.jpg")),
      "display copies only",
    );
    assert.deepEqual(slides[1], {
      id: w.ids[0],
      fileName: "IMG_0001.jpg",
      previewUrl: slides[1]!.previewUrl,
      thumbnailUrl: slides[1]!.thumbnailUrl,
      width: 4000,
      height: 6000,
    });
  });

  it("signs URLs only for the photos the slideshow shows, never the whole shoot", async () => {
    const w = await world();
    assert.equal((await w.source.shootPhotos(w.projectId)).length, 5);
    assert.equal(w.signed.length, 0, "choosing photos reads rows only");
    await w.source.slides(w.projectId, [w.ids[2]!]);
    assert.equal(w.signed.length, 2, "one preview and one thumbnail");
  });

  it("never shows a photo without display copies, or one from another shoot", async () => {
    const w = await world();
    assert.ok(!(await w.source.shootPhotos(w.projectId)).includes(w.processing));
    const slides = await w.source.slides(w.projectId, [w.processing, w.foreign, w.ids[0]!]);
    assert.deepEqual(
      slides.map((s) => s.id),
      [w.ids[0]],
    );
    assert.deepEqual(await w.source.slides(w.projectId, []), []);
  });
});

describe("the studio's side of slideshows", () => {
  it("makes a link from the whole shoot and can show it again later", async () => {
    const w = await world();
    const opened = (await w.admin.open({ projectId: w.projectId, clientName: "", source: "SHOOT" })).getValue();
    assert.equal(opened.photoCount, 5);
    assert.ok(!("password" in opened), "slideshows have no password");

    const [summary] = await w.admin.list(w.projectId);
    assert.equal(summary!.clientName, "Elena", "falls back to the client on the shoot");
    assert.equal(summary!.status, "ACTIVE");
    assert.equal(summary!.daysLeft, 180);
    assert.deepEqual(w.remembered, [{ name: "Elena", email: "elena@example.com" }]);

    const stored = [...w.sessions.items.values()][0]!;
    assert.ok(!stored.sealedSecret!.includes(opened.token), "the token is stored encrypted");
    assert.deepEqual((await w.admin.reveal(w.projectId, opened.sessionId)).getValue(), { token: opened.token });
  });

  it("is a Studio-plan feature", async () => {
    const w = await world({ slideshowsOnPlan: false });
    const result = await w.admin.open({ projectId: w.projectId, clientName: "Elena", source: "SHOOT" });
    assert.match(result.getError().message, /Studio plan/);
    assert.equal(w.sessions.items.size, 0);
  });

  it("explains why it cannot make a link: no picks yet, no album chosen, unknown album, no photos", async () => {
    const w = await world();
    const open = (source: "PICKS" | "ALBUM" | "SHOOT", albumId?: string) =>
      w.admin.open({ projectId: w.projectId, clientName: "Elena", source, albumId });

    assert.equal((await open("PICKS")).getError().code, "CONFLICT");
    assert.match((await open("PICKS")).getError().message, /not sent their picks/);
    assert.equal((await open("ALBUM")).getError().code, "VALIDATION_ERROR");
    assert.equal((await open("ALBUM", UniqueEntityId.create().toString())).getError().code, "NOT_FOUND");
    await w.emptyShoot();
    assert.match((await open("SHOOT")).getError().message, /no photos/);
    assert.equal((await open("SHOOT")).getError().code, "CONFLICT");
    assert.equal(w.sessions.items.size, 0, "nothing half-made is left behind");
  });

  it("rejects settings out of range as the photographer's mistake, not a server error", async () => {
    const w = await world();
    const result = await w.admin.open({
      projectId: w.projectId,
      clientName: "Elena",
      source: "SHOOT",
      intervalSeconds: 60,
    });
    assert.equal(result.getError().code, "VALIDATION_ERROR");
  });

  it("refreshes an album slideshow after the album changes, but not a revoked one", async () => {
    const w = await world();
    const album = await w.addAlbum([[w.ids[0]!]]);
    const opened = (
      await w.admin.open({ projectId: w.projectId, clientName: "Elena", source: "ALBUM", albumId: album.id.toString() })
    ).getValue();
    assert.equal(opened.photoCount, 1);

    album.restoreSpreads([
      ...album.spreads,
      { templateId: "single-centred", placements: [placement("slot-0", w.ids[1]!)] },
    ]);
    await w.addAlbum([]); // an unrelated album on the same shoot changes nothing
    const refreshed = (await w.admin.refresh(w.projectId, opened.sessionId)).getValue();
    assert.equal(refreshed.photoCount, 2);
    assert.equal(refreshed.albumId, album.id.toString());

    await w.admin.revoke(w.projectId, opened.sessionId);
    assert.match((await w.admin.refresh(w.projectId, opened.sessionId)).getError().message, /revoked/);
  });

  it("changes the speed and transition of an existing link", async () => {
    const w = await world();
    const { sessionId } = (await w.admin.open({ projectId: w.projectId, clientName: "E", source: "SHOOT" })).getValue();
    const updated = (await w.admin.updateSettings(w.projectId, sessionId, { intervalSeconds: 8 })).getValue();
    assert.equal(updated.intervalSeconds, 8);
    assert.equal(updated.transition, "FADE");
    const bad = await w.admin.updateSettings(w.projectId, sessionId, { intervalSeconds: 99 });
    assert.equal(bad.getError().code, "VALIDATION_ERROR");
  });

  it("treats another shoot's link as not found, whatever the action", async () => {
    const w = await world();
    const { sessionId } = (await w.admin.open({ projectId: w.projectId, clientName: "E", source: "SHOOT" })).getValue();
    const other = w.otherProjectId.toString();
    assert.equal((await w.admin.revoke(other, sessionId)).getError().code, "NOT_FOUND");
    assert.equal((await w.admin.reveal(other, sessionId)).getError().code, "NOT_FOUND");
    assert.equal((await w.admin.refresh(other, sessionId)).getError().code, "NOT_FOUND");
    assert.equal((await w.admin.updateSettings(other, sessionId, { transition: "NONE" })).getError().code, "NOT_FOUND");
    assert.equal((await w.admin.sendInvitation(other, sessionId)).getError().code, "NOT_FOUND");
    assert.equal([...w.sessions.items.values()][0]!.status, "ACTIVE");
  });

  it("emails the link with no password, on creation and as a resend", async () => {
    const w = await world();
    const opened = (
      await w.admin.open({ projectId: w.projectId, clientName: "Elena", source: "SHOOT", sendEmail: true })
    ).getValue();
    assert.equal(opened.emailSentTo, "elena@example.com");
    const mail = w.sent.at(-1)!;
    assert.match(mail.subject, /Your slideshow — Elena & Radu/);
    assert.ok(mail.text.includes(`${ORIGIN}/slideshow/${opened.token}?lang=en`));
    assert.doesNotMatch(mail.text, /Password/);

    const resent = (
      await w.admin.sendInvitation(w.projectId, opened.sessionId, { email: "mama@example.com", language: "ro" })
    ).getValue();
    assert.equal(resent.lastSentTo, "mama@example.com");
    assert.match(w.sent.at(-1)!.subject, /Slideshow-ul tău/);
    assert.match(w.sent.at(-1)!.text, /nu are nevoie de parolă/);
  });
});

describe("extending a slideshow link", () => {
  it("adds 180 days to what is left by default, or a chosen number of days", async () => {
    const w = await world();
    const { sessionId } = (await w.admin.open({ projectId: w.projectId, clientName: "E", source: "SHOOT" })).getValue();
    assert.equal((await w.admin.extend(w.projectId, sessionId)).getValue().daysLeft, 360);
    assert.equal((await w.admin.extend(w.projectId, sessionId, 5)).getValue().daysLeft, 365);
  });

  it("counts from today for a link that has already expired, so it works again", () => {
    const { session } = SlideshowSession.open({
      projectId: UniqueEntityId.create(),
      clientName: "E",
      source: "SHOOT",
      photoIds: ["a"],
      ttlDays: 1,
    });
    const muchLater = new Date(Date.now() + 40 * DAY);
    assert.ok(session.isExpired(muchLater));
    session.extend(10, muchLater);
    assert.equal(session.daysLeft(muchLater), 10);
    assert.doesNotThrow(() => session.assertViewable(muchLater));
  });

  it("refuses to bring back a revoked link, and another shoot's link is not found", async () => {
    const w = await world();
    const { sessionId } = (await w.admin.open({ projectId: w.projectId, clientName: "E", source: "SHOOT" })).getValue();
    assert.equal((await w.admin.extend(w.otherProjectId.toString(), sessionId)).getError().code, "NOT_FOUND");
    await w.admin.revoke(w.projectId, sessionId);
    const refused = await w.admin.extend(w.projectId, sessionId);
    assert.equal(refused.getError().code, "CONFLICT");
    assert.equal([...w.sessions.items.values()][0]!.status, "REVOKED");
  });
});

describe("the client's side of slideshows", () => {
  it("shows the saved photos in order with the studio's look and settings", async () => {
    const w = await world();
    const album = await w.addAlbum([[w.ids[3]!, w.ids[1]!]]);
    const { token } = (
      await w.admin.open({
        projectId: w.projectId,
        clientName: "Elena",
        source: "ALBUM",
        albumId: album.id.toString(),
        intervalSeconds: 7,
        transition: "NONE",
      })
    ).getValue();

    const view = (await w.portal.view(token)).getValue();
    assert.equal(view.projectName, "Elena & Radu");
    assert.equal(view.branding?.name, "Studio Lumina");
    assert.deepEqual(view.settings, { intervalSeconds: 7, transition: "NONE" });
    assert.deepEqual(
      view.photos.map((p) => p.id),
      [w.ids[3], w.ids[1]],
    );
  });

  it("keeps playing what is left when a photo is deleted from the shoot", async () => {
    const w = await world();
    const { token } = (await w.admin.open({ projectId: w.projectId, clientName: "E", source: "SHOOT" })).getValue();
    await w.removeFromShoot(w.ids[0]!);
    assert.equal((await w.portal.view(token)).getValue().photos.length, 4);
  });

  it("answers a revoked or expired link with a clear message, and an unknown one with not found", async () => {
    const w = await world();
    const { token, sessionId } = (
      await w.admin.open({ projectId: w.projectId, clientName: "E", source: "SHOOT", ttlDays: 1 })
    ).getValue();
    assert.equal((await w.portal.view("not-a-real-token")).getError().code, "NOT_FOUND");

    const later = new SlideshowPortalUseCase(
      w.sessions,
      w.source,
      { loadProject: async () => undefined },
      silentLogger,
      () => new Date(Date.now() + 2 * DAY),
    );
    assert.match((await later.view(token)).getError().message, /expired/);

    await w.admin.revoke(w.projectId, sessionId);
    const revoked = await w.portal.view(token);
    assert.equal(revoked.getError().code, "CONFLICT");
    assert.match(revoked.getError().message, /no longer available/);
  });

  it("counts views, and a failure to count never stops the slideshow", async () => {
    const w = await world();
    const { token } = (await w.admin.open({ projectId: w.projectId, clientName: "E", source: "SHOOT" })).getValue();
    await w.portal.recordView(token);
    await w.portal.recordView(token);
    const [summary] = await w.admin.list(w.projectId);
    assert.equal(summary!.viewCount, 2);
    assert.ok(summary!.lastViewedAt);

    w.sessions.save = async () => {
      throw new Error("database is down");
    };
    assert.ok((await w.portal.recordView(token)).isSuccess);
    assert.deepEqual(
      w.logger.entries.map((e) => [e.level, e.message]),
      [["warn", "could not record a slideshow view"]],
    );
  });
});

describe("slideshow routes", () => {
  it("serves the studio and the client over HTTP", async () => {
    const w = await world();
    const app = Fastify();
    registerSlideshowRoutes(app, { slideshowAdmin: w.admin, slideshowPortal: w.portal });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const json = { "content-type": "application/json" };

    const created = await fetch(`${base}/projects/${w.projectId}/slideshow-sessions`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ source: "SHOOT", clientName: "Elena" }),
    });
    assert.equal(created.status, 201);
    const { token, sessionId } = (await created.json()) as { token: string; sessionId: string };

    const view = await fetch(`${base}/slideshow/${token}`);
    assert.equal(view.status, 200);
    assert.equal(view.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.equal(((await view.json()) as { photos: unknown[] }).photos.length, 5);
    assert.equal((await fetch(`${base}/slideshow/${token}/viewed`, { method: "POST" })).status, 204);
    assert.equal((await fetch(`${base}/slideshow/unknown-token-value`)).status, 404);

    const patched = await fetch(`${base}/projects/${w.projectId}/slideshow-sessions/${sessionId}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ intervalSeconds: 10 }),
    });
    assert.equal(((await patched.json()) as { intervalSeconds: number }).intervalSeconds, 10);

    const access = await fetch(`${base}/projects/${w.projectId}/slideshow-sessions/${sessionId}/access`);
    assert.deepEqual(await access.json(), { token });
    const list = (await (await fetch(`${base}/projects/${w.projectId}/slideshow-sessions`)).json()) as {
      viewCount: number;
    }[];
    assert.equal(list[0]!.viewCount, 1);

    assert.equal(
      (await fetch(`${base}/projects/${w.projectId}/slideshow-sessions/${sessionId}/refresh`, { method: "POST" }))
        .status,
      200,
    );
    const extended = await fetch(`${base}/projects/${w.projectId}/slideshow-sessions/${sessionId}/extend`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ days: 30 }),
    });
    assert.equal(((await extended.json()) as { daysLeft: number }).daysLeft, 210);
    assert.equal(
      (await fetch(`${base}/projects/${w.projectId}/slideshow-sessions/${sessionId}/revoke`, { method: "POST" }))
        .status,
      200,
    );
    assert.equal((await fetch(`${base}/slideshow/${token}`)).status, 409);
    await app.close();
  });
});

describe("deleting a shoot", () => {
  it("removes its slideshow links too, and only its own", async () => {
    const projects = new InMemoryProjectRepository();
    const sessions = new InMemorySlideshowSessionRepository();
    const project = Project.create({ studioId: UniqueEntityId.create(), name: "Elena & Radu", type: "WEDDING" });
    await projects.save(project);
    const mine = SlideshowSession.open({ projectId: project.id, clientName: "E", source: "SHOOT", photoIds: ["a"] });
    const theirs = SlideshowSession.open({
      projectId: UniqueEntityId.create(),
      clientName: "F",
      source: "SHOOT",
      photoIds: ["b"],
    });
    await sessions.save(mine.session);
    await sessions.save(theirs.session);

    const result = await new DeleteProjectUseCase(
      projects,
      new InMemoryPhotoRepository(),
      new InMemoryObjectStorage(),
      new InMemoryPhotoAnalysisRepository(),
      new InMemoryAlbumRepository(),
      new InMemoryExportJobRepository(),
      { delete: async () => {} } as never,
      new InMemoryReviewSessionRepository(),
      undefined,
      new InMemoryPickSessionRepository(),
      undefined,
      sessions,
    ).execute({ projectId: project.id.toString() });

    assert.ok(result.isSuccess);
    assert.deepEqual([...sessions.items.keys()], [theirs.session.id.toString()]);
  });
});
