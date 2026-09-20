import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import sharp from "sharp";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Album } from "../src/modules/album-composition/domain/album";
import { ExportJob } from "../src/modules/export-print/domain/export-job";
import { GenerateDerivativesUseCase } from "../src/modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { ListProjectPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { PromoteSelectedPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/promote-selected/promote-selected.use-case";
import { PurgeExpiredOriginalsUseCase } from "../src/modules/media-ingestion/application/use-cases/purge-expired-originals/purge-expired-originals.use-case";
import { DeleteProjectUseCase } from "../src/modules/media-ingestion/application/use-cases/delete-project/delete-project.use-case";
import { SharpImageResizer } from "../src/modules/media-ingestion/infrastructure/imaging/sharp-image-resizer";
import { AlbumCompositionPlacementDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/album-placement-gateway";
import { ExportPrintDeliveryDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/delivery-gateway";
import { PromoteOnApprovalNotifier } from "../src/modules/review-collaboration/infrastructure/gateways/promote-on-approval-notifier";
import { StoragePhotoPreviewResolver } from "../src/modules/review-collaboration/infrastructure/gateways/photo-preview-resolver";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";
import { TieredPhotoByteSource } from "../src/infrastructure/storage/tiered-photo-byte-source";
import { registerMediaRoutes } from "../src/interface/media-routes";
import { InMemoryStorageProvider } from "../src/dev/in-memory-storage-provider";
import { QUEUES } from "../src/shared-kernel/job-queue";
import { signJwt } from "../src/shared-kernel/jwt";
import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryJobQueue,
  InMemoryObjectStorage,
  InMemoryPhotoAnalysisRepository,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
} from "./support/in-memory";

const DAY = 24 * 60 * 60 * 1000;
const FULL = { x: 0, y: 0, width: 1, height: 1 };

async function world() {
  const signer = new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test");
  const permanent = new InMemoryStorageProvider(signer);
  const staging = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const albums = new InMemoryAlbumRepository();
  const exportJobs = new InMemoryExportJobRepository();

  const studio = UniqueEntityId.create();
  const project = Project.create({ studioId: studio, name: "Elena & Radu", type: "WEDDING" });
  await projects.save(project);

  const original = await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 90, g: 60, b: 30 } },
  })
    .jpeg({ quality: 88 })
    .toBuffer();

  async function addPhoto(name: string, projectRef = project) {
    const photo = Photo.requestUpload({
      projectId: projectRef.id,
      studioId: projectRef.studioId,
      fileName: name,
      mimeType: "image/jpeg",
      byteSize: original.byteLength,
    });
    staging.upload(photo.storageKey.toString(), new Uint8Array(original));
    photo.markUploaded({ byteSize: original.byteLength });
    await photos.save(photo);
    return photo;
  }

  async function albumWith(photoIds: string[]) {
    const album = Album.create({
      projectId: project.id,
      title: "Album",
      spreads: [
        {
          templateId: "portrait-pair",
          placements: photoIds.map((photoId, index) => ({
            slotId: index === 0 ? "left" : "right",
            photoId,
            crop: FULL,
            treatment: "COLOR" as const,
          })),
        },
      ],
    });
    await albums.save(album);
    return album;
  }

  const placements = new AlbumCompositionPlacementDirectory(albums);
  const promoter = new PromoteSelectedPhotosUseCase(photos, staging, permanent, placements);

  return { signer, permanent, staging, photos, projects, albums, exportJobs, project, addPhoto, albumWith, placements, promoter, original };
}

function deliveredExport(albumId: UniqueEntityId, completedAt: Date, status: "READY" | "FAILED" = "READY") {
  return ExportJob.reconstitute(
    {
      albumId,
      printProfileId: "lab-standard-300",
      status,
      storageKey: "exports/x.pdf",
      byteSize: 1,
      pageCount: 1,
      failureReason: undefined,
      requestedAt: completedAt,
      completedAt,
    },
    UniqueEntityId.create(),
  );
}

describe("tier 1 — previews go to long-term storage, originals stay in staging", () => {
  it("writes both display copies to the long-term provider and none beside the original", async () => {
    const w = await world();
    const photo = await w.addPhoto("a.jpg");

    const result = await new GenerateDerivativesUseCase(
      w.photos,
      w.staging,
      new SharpImageResizer(),
      w.permanent,
      1800,
    ).execute({ photoId: photo.id.toString() });
    assert.ok(result.isSuccess);

    const stored = await w.photos.findById(photo.id);
    assert.equal(stored?.permanentDerivatives, true);
    assert.ok(await w.permanent.head(photo.storageKey.derivative("preview").toString()));
    assert.ok(await w.permanent.head(photo.storageKey.derivative("thumb").toString()));
    assert.equal(w.staging.objects.has(photo.storageKey.derivative("preview").toString()), false);
    // The full-resolution original is NOT copied speculatively.
    assert.equal(await w.permanent.head(photo.storageKey.toString()), undefined);
  });

  it("cuts the long-term preview at the configured long edge", async () => {
    const w = await world();
    const photo = await w.addPhoto("a.jpg");
    await new GenerateDerivativesUseCase(w.photos, w.staging, new SharpImageResizer(), w.permanent, 1800).execute({
      photoId: photo.id.toString(),
    });
    const preview = await sharp(w.permanent.objects.get(photo.storageKey.derivative("preview").toString())).metadata();
    // The fixture is only 2400 wide, so 1800 is a real downscale.
    assert.equal(Math.max(preview.width ?? 0, preview.height ?? 0), 1800);
  });

  it("with no long-term provider it behaves exactly as before", async () => {
    const w = await world();
    const photo = await w.addPhoto("a.jpg");
    await new GenerateDerivativesUseCase(w.photos, w.staging, new SharpImageResizer()).execute({
      photoId: photo.id.toString(),
    });
    assert.equal((await w.photos.findById(photo.id))?.permanentDerivatives, false);
    assert.ok(w.staging.objects.has(photo.storageKey.derivative("preview").toString()));
  });

  it("lists signed API URLs for long-term previews and storage URLs for the rest", async () => {
    const w = await world();
    const longTerm = await w.addPhoto("long.jpg");
    const legacy = await w.addPhoto("legacy.jpg");
    await new GenerateDerivativesUseCase(w.photos, w.staging, new SharpImageResizer(), w.permanent).execute({
      photoId: longTerm.id.toString(),
    });
    await new GenerateDerivativesUseCase(w.photos, w.staging, new SharpImageResizer()).execute({
      photoId: legacy.id.toString(),
    });

    const views = await new ListProjectPhotosUseCase(w.photos, w.staging, w.permanent).execute(w.project.id.toString());
    const byName = new Map(views.map((view) => [view.fileName, view]));
    assert.ok(byName.get("long.jpg")?.previewUrl?.startsWith("https://api.example.test/media/"));
    assert.ok(byName.get("legacy.jpg")?.previewUrl?.startsWith("memory://"));
  });

  it("gives a reviewing client the same signed URL for a long-term preview", async () => {
    const w = await world();
    const photo = await w.addPhoto("a.jpg");
    await new GenerateDerivativesUseCase(w.photos, w.staging, new SharpImageResizer(), w.permanent).execute({
      photoId: photo.id.toString(),
    });
    const url = await new StoragePhotoPreviewResolver(w.photos, w.staging, w.permanent).previewUrl(photo.id.toString());
    assert.ok(url?.startsWith("https://api.example.test/media/"));
  });
});

describe("tier 2 — promoting only the selected originals", () => {
  it("copies exactly the photos placed on the album, at the same key", async () => {
    const w = await world();
    const [chosenA, chosenB, unchosen] = [await w.addPhoto("a.jpg"), await w.addPhoto("b.jpg"), await w.addPhoto("c.jpg")];
    const album = await w.albumWith([chosenA.id.toString(), chosenB.id.toString()]);

    const result = await w.promoter.execute({ albumId: album.id.toString() });
    assert.ok(result.isSuccess);
    assert.equal(result.getValue().promoted, 2);

    assert.deepEqual(await w.permanent.head(chosenA.storageKey.toString()), { key: chosenA.storageKey.toString(), size: w.original.byteLength });
    assert.ok(await w.permanent.head(chosenB.storageKey.toString()));
    assert.equal(await w.permanent.head(unchosen.storageKey.toString()), undefined, "an unselected photo must never be copied");

    const stored = await w.photos.findById(chosenA.id);
    assert.ok(stored?.selectedAt && stored.fullResStoredAt);
    assert.equal((await w.photos.findById(unchosen.id))?.selectedAt, undefined);
  });

  it("is idempotent — a second run does no copying", async () => {
    const w = await world();
    const photo = await w.addPhoto("a.jpg");
    const album = await w.albumWith([photo.id.toString()]);
    await w.promoter.execute({ albumId: album.id.toString() });

    const again = await w.promoter.execute({ albumId: album.id.toString() });
    assert.equal(again.getValue().promoted, 0);
    assert.equal(again.getValue().alreadyStored, 1);
  });

  it("re-uploads a copy that was left truncated by an interrupted transfer", async () => {
    const w = await world();
    const photo = await w.addPhoto("a.jpg");
    const album = await w.albumWith([photo.id.toString()]);
    await w.permanent.upload(photo.storageKey.toString(), Buffer.from("partial"), { contentType: "image/jpeg" });

    const result = await w.promoter.execute({ albumId: album.id.toString() });
    assert.equal(result.getValue().promoted, 1);
    assert.equal((await w.permanent.head(photo.storageKey.toString()))?.size, w.original.byteLength);
  });

  it("finishes the rest and reports failure when one original is missing, so a retry redoes only that one", async () => {
    const w = await world();
    const good = await w.addPhoto("good.jpg");
    const lost = await w.addPhoto("lost.jpg");
    w.staging.objects.delete(lost.storageKey.toString());
    const album = await w.albumWith([good.id.toString(), lost.id.toString()]);

    const result = await w.promoter.execute({ albumId: album.id.toString() });
    assert.ok(result.isFailure);
    assert.match(result.getError().message, /no longer staged/);
    assert.ok(await w.permanent.head(good.storageKey.toString()), "the healthy photo is still promoted");
    assert.equal((await w.photos.findById(lost.id))?.fullResStoredAt, undefined);
  });

  it("ignores a placement that points at another shoot's photo", async () => {
    const w = await world();
    const other = Project.create({ studioId: UniqueEntityId.create(), name: "Someone else", type: "EVENT" });
    await w.projects.save(other);
    const foreign = await w.addPhoto("foreign.jpg", other);
    const album = await w.albumWith([foreign.id.toString()]);

    const result = await w.promoter.execute({ albumId: album.id.toString() });
    assert.equal(result.getValue().skipped, 1);
    assert.equal(await w.permanent.head(foreign.storageKey.toString()), undefined);
  });
});

describe("retention — expiring staged originals after delivery", () => {
  async function purger(w: Awaited<ReturnType<typeof world>>, now: Date) {
    return new PurgeExpiredOriginalsUseCase(
      w.projects,
      w.photos,
      w.staging,
      new ExportPrintDeliveryDirectory(w.exportJobs, w.albums),
      w.placements,
      w.promoter,
      30,
      () => now,
    );
  }

  async function derivedPhoto(w: Awaited<ReturnType<typeof world>>, name: string) {
    const photo = await w.addPhoto(name);
    await new GenerateDerivativesUseCase(w.photos, w.staging, new SharpImageResizer(), w.permanent).execute({
      photoId: photo.id.toString(),
    });
    return photo;
  }

  it("deletes unselected originals but keeps previews, and keeps selected originals on long-term storage", async () => {
    const w = await world();
    const chosen = await derivedPhoto(w, "chosen.jpg");
    const unchosen = await derivedPhoto(w, "unchosen.jpg");
    const album = await w.albumWith([chosen.id.toString()]);
    const now = new Date();
    await w.exportJobs.save(deliveredExport(album.id, new Date(now.getTime() - 31 * DAY)));

    const summary = await (await purger(w, now)).execute();

    assert.equal(summary.purged, 2);
    assert.equal(w.staging.objects.has(unchosen.storageKey.toString()), false);
    assert.equal(w.staging.objects.has(chosen.storageKey.toString()), false, "staging copy of a selected photo is redundant once stored long-term");
    assert.ok(await w.permanent.head(chosen.storageKey.toString()), "the selected original survives on long-term storage");
    assert.equal(await w.permanent.head(unchosen.storageKey.toString()), undefined);
    assert.ok(await w.permanent.head(unchosen.storageKey.derivative("preview").toString()), "previews outlive the purge");
    assert.ok((await w.photos.findById(unchosen.id))?.stagedOriginalPurgedAt);
  });

  it("promotes album photos first, so an exported-but-never-approved shoot loses nothing", async () => {
    const w = await world();
    const placed = await derivedPhoto(w, "placed.jpg");
    const album = await w.albumWith([placed.id.toString()]);
    const now = new Date();
    await w.exportJobs.save(deliveredExport(album.id, new Date(now.getTime() - 40 * DAY)));
    assert.equal((await w.photos.findById(placed.id))?.fullResStoredAt, undefined, "no approval ever triggered a promotion");

    await (await purger(w, now)).execute();

    assert.ok(await w.permanent.head(placed.storageKey.toString()), "the only full-res copy must exist before staging is emptied");
  });

  it("holds back a placed photo it could not confirm on long-term storage", async () => {
    const w = await world();
    const placed = await derivedPhoto(w, "placed.jpg");
    const album = await w.albumWith([placed.id.toString()]);
    const now = new Date();
    await w.exportJobs.save(deliveredExport(album.id, new Date(now.getTime() - 40 * DAY)));
    // Long-term storage rejects writes: promotion cannot succeed.
    w.permanent.upload = async () => {
      throw new Error("DigiStorage unreachable");
    };

    const summary = await (await purger(w, now)).execute();

    assert.equal(summary.purged, 0);
    assert.equal(summary.heldBack, 1);
    assert.ok(w.staging.objects.has(placed.storageKey.toString()), "the only copy must stay where it is");
  });

  it("leaves a photo alone until its display copies exist", async () => {
    const w = await world();
    const undecoded = await w.addPhoto("fresh.jpg");
    const album = await w.albumWith([]);
    const now = new Date();
    await w.exportJobs.save(deliveredExport(album.id, new Date(now.getTime() - 40 * DAY)));

    const summary = await (await purger(w, now)).execute();

    assert.equal(summary.heldBack, 1);
    assert.ok(w.staging.objects.has(undecoded.storageKey.toString()));
  });

  it("does nothing inside the retention window, for undelivered shoots, or after a fresh re-export", async () => {
    const w = await world();
    const photo = await derivedPhoto(w, "a.jpg");
    const album = await w.albumWith([]);
    const now = new Date();

    // No export at all.
    assert.equal((await (await purger(w, now)).execute()).purged, 0);
    // Delivered only 29 days ago.
    await w.exportJobs.save(deliveredExport(album.id, new Date(now.getTime() - 29 * DAY)));
    assert.equal((await (await purger(w, now)).execute()).purged, 0);
    // An old delivery, but a re-export just finished: the clock restarts.
    await w.exportJobs.save(deliveredExport(album.id, new Date(now.getTime() - 90 * DAY)));
    assert.equal((await (await purger(w, now)).execute()).purged, 0);
    // A failed export is not a delivery.
    const failedOnly = await world();
    const p2 = await derivedPhoto(failedOnly, "b.jpg");
    const a2 = await failedOnly.albumWith([]);
    await failedOnly.exportJobs.save(deliveredExport(a2.id, new Date(now.getTime() - 90 * DAY), "FAILED"));
    assert.equal((await (await purger(failedOnly, now)).execute()).purged, 0);

    assert.ok(w.staging.objects.has(photo.storageKey.toString()));
    assert.ok(failedOnly.staging.objects.has(p2.storageKey.toString()));
  });

  it("re-exporting after the sweep still works, because the original is read back from long-term storage", async () => {
    const w = await world();
    const chosen = await derivedPhoto(w, "chosen.jpg");
    const album = await w.albumWith([chosen.id.toString()]);
    const now = new Date();
    await w.exportJobs.save(deliveredExport(album.id, new Date(now.getTime() - 31 * DAY)));
    await (await purger(w, now)).execute();
    assert.equal(w.staging.objects.has(chosen.storageKey.toString()), false);

    const bytes = await new TieredPhotoByteSource(w.staging, w.permanent).read(chosen.storageKey.toString());
    assert.equal(bytes.byteLength, w.original.byteLength);
  });

  it("does not hide a genuine staging failure when long-term storage has no copy either", async () => {
    const w = await world();
    await assert.rejects(() => new TieredPhotoByteSource(w.staging, w.permanent).read("studios/x/projects/y/originals/none.jpg"), /No object/);
  });
});

describe("approval trigger", () => {
  const decision = { albumId: "album-1", clientName: "Elena", openComments: 0 };

  it("queues a promotion only when the client approves", async () => {
    const jobs = new InMemoryJobQueue();
    const notifier = new PromoteOnApprovalNotifier({ clientDecided: async () => {} }, jobs);
    await notifier.clientDecided({ ...decision, decision: "CHANGES_REQUESTED" });
    assert.equal(jobs.jobs.length, 0);
    await notifier.clientDecided({ ...decision, decision: "APPROVED" });
    assert.deepEqual(jobs.jobs, [{ queue: QUEUES.storage, name: "promote-selected", payload: { albumId: "album-1" } }]);
  });

  it("never fails the client's decision because the queue is down", async () => {
    const logged: string[] = [];
    const notifier = new PromoteOnApprovalNotifier(
      { clientDecided: async () => {} },
      { enqueue: async () => { throw new Error("redis down"); } },
      (message) => logged.push(message),
    );
    await notifier.clientDecided({ ...decision, decision: "APPROVED" });
    assert.equal(logged.length, 1);
  });
});

describe("project deletion", () => {
  it("removes the project's whole long-term prefix and nothing of a neighbour's", async () => {
    const w = await world();
    const photo = await w.addPhoto("a.jpg");
    await new GenerateDerivativesUseCase(w.photos, w.staging, new SharpImageResizer(), w.permanent).execute({
      photoId: photo.id.toString(),
    });
    await w.permanent.upload(photo.storageKey.toString(), Buffer.from("full"), { contentType: "image/jpeg" });
    await w.permanent.upload("studios/other/projects/keep/originals/k.jpg", Buffer.from("k"), { contentType: "image/jpeg" });

    const result = await new DeleteProjectUseCase(
      w.projects,
      w.photos,
      w.staging,
      new InMemoryPhotoAnalysisRepository(),
      w.albums,
      w.exportJobs,
      w.staging,
      new InMemoryReviewSessionRepository(),
      w.permanent,
    ).execute({ projectId: w.project.id.toString() });

    assert.ok(result.isSuccess);
    assert.deepEqual([...w.permanent.objects.keys()], ["studios/other/projects/keep/originals/k.jpg"]);
  });
});

describe("GET /media/:token", () => {
  async function app() {
    const w = await world();
    const server = Fastify();
    registerMediaRoutes(server, { signer: w.signer, provider: w.permanent });
    const key = "studios/s/projects/p/derivatives/a-preview.jpg";
    await w.permanent.upload(key, Buffer.from("jpeg-bytes"), { contentType: "image/jpeg" });
    return { server, w, key };
  }

  it("streams the object for a valid token with the right content type", async () => {
    const { server, w, key } = await app();
    const token = (await w.permanent.getUrl(key, { expiresInSeconds: 60 })).split("/media/")[1]!;
    // Regression: a named route parameter is capped at 100 chars and answers 414.
    assert.ok(token.length > 100, "the test must use a realistically long token");
    const response = await server.inject({ method: "GET", url: `/media/${token}` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/jpeg");
    assert.equal(response.body, "jpeg-bytes");
  });

  it("refuses forged, expired, and login tokens", async () => {
    const { server, w, key } = await app();
    const good = (await w.permanent.getUrl(key, { expiresInSeconds: 60 })).split("/media/")[1]!;
    const forged = `${good.slice(0, -3)}abc`;
    const expired = (await new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://x").sign(key, -10)).split("/media/")[1]!;
    for (const token of [forged, expired, "not.a.token"]) {
      assert.equal((await server.inject({ method: "GET", url: `/media/${token}` })).statusCode, 403, token);
    }
  });

  it("does not accept a login token as a media token", async () => {
    const { server, key } = await app();
    const login = signJwt({ sub: key }, "test-secret-test-secret-test-secret-123", 60);
    assert.equal((await server.inject({ method: "GET", url: `/media/${login}` })).statusCode, 403);
  });

  it("returns 404 for a valid token whose object is gone", async () => {
    const { server, w, key } = await app();
    const token = (await w.permanent.getUrl(key, { expiresInSeconds: 60 })).split("/media/")[1]!;
    await w.permanent.delete(key);
    assert.equal((await server.inject({ method: "GET", url: `/media/${token}` })).statusCode, 404);
  });
});
