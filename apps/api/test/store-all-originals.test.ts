import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Album } from "../src/modules/album-composition/domain/album";
import { ExportJob } from "../src/modules/export-print/domain/export-job";
import { ConfirmUploadUseCase } from "../src/modules/media-ingestion/application/use-cases/confirm-upload/confirm-upload.use-case";
import { StoreOriginalUseCase } from "../src/modules/media-ingestion/application/use-cases/store-original/store-original.use-case";
import { StorePendingOriginalsUseCase } from "../src/modules/media-ingestion/application/use-cases/store-original/store-pending-originals.use-case";
import { PromoteSelectedPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/promote-selected/promote-selected.use-case";
import { PurgeExpiredOriginalsUseCase } from "../src/modules/media-ingestion/application/use-cases/purge-expired-originals/purge-expired-originals.use-case";
import { AlbumCompositionPlacementDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/album-placement-gateway";
import { ExportPrintDeliveryDirectory } from "../src/modules/media-ingestion/infrastructure/gateways/delivery-gateway";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";
import { InMemoryStorageProvider } from "../src/dev/in-memory-storage-provider";
import { loadEnv } from "../src/shared-kernel/env";
import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryJobQueue,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
} from "./support/in-memory";

const DAY = 24 * 60 * 60 * 1000;

/** A long-term tier that can be told to fail, and counts every write — to prove idempotence and failure handling. */
class FlakyProvider extends InMemoryStorageProvider {
  uploads = 0;
  failAll = false;
  failKeys = new Set<string>();
  override async upload(key: string, body: Buffer): Promise<void> {
    if (this.failAll || this.failKeys.has(key)) throw new Error("DigiStorage is unreachable");
    this.uploads++;
    await super.upload(key, body);
  }
}

async function world() {
  const permanent = new FlakyProvider(new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test"));
  const staging = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const albums = new InMemoryAlbumRepository();
  const exportJobs = new InMemoryExportJobRepository();
  const project = Project.create({ studioId: UniqueEntityId.create(), name: "Big wedding", type: "WEDDING" });
  await projects.save(project);

  let clock = 0;
  async function addPhoto(name: string, options: { finished?: boolean; derived?: boolean } = {}) {
    const bytes = Buffer.from(`original of ${name} `.repeat(30));
    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId: project.studioId,
      fileName: name,
      mimeType: "image/jpeg",
      byteSize: bytes.byteLength,
    });
    if (options.finished !== false) {
      staging.upload(photo.storageKey.toString(), new Uint8Array(bytes));
      photo.markUploaded({ byteSize: bytes.byteLength });
    }
    if (options.derived) photo.markDerivativesReady({ permanent: true });
    await photos.save(photo);
    return { photo, bytes, key: photo.storageKey.toString(), created: ++clock };
  }

  const store = new StoreOriginalUseCase(photos, staging, permanent);
  return { permanent, staging, photos, projects, albums, exportJobs, project, addPhoto, store };
}

describe("StoreOriginalUseCase — one original to long-term storage", () => {
  it("copies the original byte for byte at the same key, and marks it stored (not 'selected')", async () => {
    const w = await world();
    const { photo, bytes, key } = await w.addPhoto("a.jpg");
    const result = await w.store.execute({ photoId: photo.id.toString() });

    assert.equal(result.getValue(), "stored");
    assert.deepEqual(w.permanent.objects.get(key), bytes);
    const after = await w.photos.findById(photo.id);
    assert.ok(after?.fullResStoredAt);
    assert.equal(after?.selectedAt, undefined, "storing everything is not the same as a client selecting a photo");
  });

  it("is safe to run repeatedly: a stored photo is not uploaded again", async () => {
    const w = await world();
    const { photo } = await w.addPhoto("a.jpg");
    await w.store.execute({ photoId: photo.id.toString() });
    const second = await w.store.execute({ photoId: photo.id.toString() });
    assert.equal(second.getValue(), "already-stored");
    assert.equal(w.permanent.uploads, 1);
  });

  it("repairs an earlier copy that was cut short", async () => {
    const w = await world();
    const { photo, bytes, key } = await w.addPhoto("a.jpg");
    w.permanent.objects.set(key, bytes.subarray(0, 10));
    const result = await w.store.execute({ photoId: photo.id.toString() });
    assert.equal(result.getValue(), "stored");
    assert.deepEqual(w.permanent.objects.get(key), bytes);
  });

  it("notices a copy that landed but was never recorded (a crash between the two steps)", async () => {
    const w = await world();
    const { photo, bytes, key } = await w.addPhoto("a.jpg");
    w.permanent.objects.set(key, bytes);
    const result = await w.store.execute({ photoId: photo.id.toString() });
    assert.equal(result.getValue(), "already-stored");
    assert.ok((await w.photos.findById(photo.id))?.fullResStoredAt);
    assert.equal(w.permanent.uploads, 0);
  });

  it("reports a failure — and leaves the photo unmarked — when the long-term tier is down", async () => {
    const w = await world();
    const { photo } = await w.addPhoto("a.jpg");
    w.permanent.failAll = true;
    const result = await w.store.execute({ photoId: photo.id.toString() });
    assert.ok(result.isFailure);
    assert.match(result.getError().message, /unreachable/);
    assert.equal((await w.photos.findById(photo.id))?.fullResStoredAt, undefined);
  });

  it("fails clearly when the original is neither staged nor stored", async () => {
    const w = await world();
    const { photo, key } = await w.addPhoto("a.jpg");
    w.staging.objects.delete(key);
    const result = await w.store.execute({ photoId: photo.id.toString() });
    assert.ok(result.isFailure);
    assert.match(result.getError().message, /no longer staged/);
  });

  it("skips a photo whose upload never finished, and one that no longer exists", async () => {
    const w = await world();
    const pending = await w.addPhoto("pending.jpg", { finished: false });
    assert.equal((await w.store.execute({ photoId: pending.photo.id.toString() })).getValue(), "skipped");
    assert.equal((await w.store.execute({ photoId: UniqueEntityId.create().toString() })).getValue(), "skipped");
  });
});

describe("StorePendingOriginalsUseCase — the backfill and safety net", () => {
  it("stores every original that is not yet there, across several batches", async () => {
    const w = await world();
    const added = [];
    for (let i = 0; i < 7; i++) added.push(await w.addPhoto(`p${i}.jpg`));
    const sweep = new StorePendingOriginalsUseCase(w.photos, w.store, Date.now, () => {});

    const summary = await sweep.execute({ batchSize: 3 });
    assert.equal(summary.stored, 7);
    assert.equal(summary.failed, 0);
    for (const { key, bytes } of added) assert.deepEqual(w.permanent.objects.get(key), bytes);
    assert.equal((await w.photos.findAwaitingLongTermStorage(10)).length, 0);
  });

  it("backfills photos uploaded before long-term storage existed, and leaves the rest alone", async () => {
    const w = await world();
    const old = await w.addPhoto("old.jpg");
    const done = await w.addPhoto("done.jpg");
    await w.store.execute({ photoId: done.photo.id.toString() });
    const pending = await w.addPhoto("pending.jpg", { finished: false });
    const purged = await w.addPhoto("purged.jpg");
    await w.photos.markStagedOriginalPurged(purged.photo.id, new Date());
    w.permanent.uploads = 0;

    const summary = await new StorePendingOriginalsUseCase(w.photos, w.store, Date.now, () => {}).execute();
    assert.equal(summary.stored, 1, "only old.jpg needed storing");
    assert.equal(w.permanent.uploads, 1);
    assert.ok(w.permanent.objects.has(old.key));
    assert.ok(!w.permanent.objects.has(pending.key));
    assert.ok(!w.permanent.objects.has(purged.key));
  });

  it("does not let one failing photo block the others, and does not spin on it", async () => {
    const w = await world();
    const a = await w.addPhoto("a.jpg");
    const bad = await w.addPhoto("bad.jpg");
    const c = await w.addPhoto("c.jpg");
    w.permanent.failKeys.add(bad.key);
    const logged: string[] = [];
    const summary = await new StorePendingOriginalsUseCase(w.photos, w.store, Date.now, (m) => logged.push(m)).execute({ batchSize: 1 });

    assert.equal(summary.stored, 2);
    assert.equal(summary.failed, 1, "tried once this run, not endlessly");
    assert.ok(w.permanent.objects.has(a.key) && w.permanent.objects.has(c.key));
    assert.equal(logged.length, 1);

    // The next run retries it, and succeeds once DigiStorage is reachable again.
    w.permanent.failKeys.clear();
    const retry = await new StorePendingOriginalsUseCase(w.photos, w.store, Date.now, () => {}).execute();
    assert.equal(retry.stored, 1);
    assert.ok(w.permanent.objects.has(bad.key));
  });

  it("stops at its time budget and lets the next run continue", async () => {
    const w = await world();
    for (let i = 0; i < 6; i++) await w.addPhoto(`p${i}.jpg`);
    let now = 0;
    const clock = () => (now += 100); // every look at the clock costs 100ms
    const sweep = new StorePendingOriginalsUseCase(w.photos, w.store, clock, () => {});

    const first = await sweep.execute({ budgetMs: 350, batchSize: 10 });
    assert.equal(first.stoppedEarly, true);
    assert.ok(first.stored > 0 && first.stored < 6);

    now = 0;
    const rest = await sweep.execute({ budgetMs: 1_000_000, batchSize: 10 });
    assert.equal(rest.stoppedEarly, false);
    assert.equal(first.stored + rest.stored, 6);
  });
});

describe("confirming an upload", () => {
  async function confirmWith(storeOriginalLongTerm: boolean | undefined, jobs = new InMemoryJobQueue()) {
    const w = await world();
    // The state confirm-upload really sees: the browser has put the file in staging, nothing more.
    const { photo, bytes, key } = await w.addPhoto("a.jpg", { finished: false });
    w.staging.upload(key, new Uint8Array(bytes));
    const useCase =
      storeOriginalLongTerm === undefined
        ? new ConfirmUploadUseCase(w.photos, w.staging, jobs)
        : new ConfirmUploadUseCase(w.photos, w.staging, jobs, storeOriginalLongTerm);
    const result = await useCase.execute({ photoId: photo.id.toString() });
    return { result, jobs, photo };
  }

  it("queues the long-term copy of the original when every photo is meant to be stored", async () => {
    const { jobs, photo } = await confirmWith(true);
    const storage = jobs.jobs.filter((j) => j.queue === "storage");
    assert.equal(storage.length, 1);
    assert.equal(storage[0]?.name, "store-original");
    assert.deepEqual(storage[0]?.payload, { photoId: photo.id.toString() });
  });

  it("queues nothing extra otherwise — the default and the 'selected only' setting behave as before", async () => {
    assert.equal((await confirmWith(false)).jobs.jobs.filter((j) => j.queue === "storage").length, 0);
    assert.equal((await confirmWith(undefined)).jobs.jobs.filter((j) => j.queue === "storage").length, 0);
  });

  it("still succeeds if the queue is down — the upload is safe, and the sweep will catch up", async () => {
    const failing = { enqueue: async (queue: string) => { if (queue === "storage") throw new Error("redis down"); } } as unknown as InMemoryJobQueue;
    const { result } = await confirmWith(true, failing);
    assert.ok(result.isSuccess);
  });
});

describe("retention when every original lives on long-term storage", () => {
  async function purger(w: Awaited<ReturnType<typeof world>>, now: Date, storeEverything: boolean) {
    const album = Album.create({ projectId: w.project.id, title: "A", spreads: [] });
    await w.albums.save(album);
    await w.exportJobs.save(
      ExportJob.reconstitute(
        {
          albumId: album.id, printProfileId: "lab-standard-300", status: "READY", storageKey: "exports/x.pdf",
          byteSize: 1, pageCount: 1, failureReason: undefined,
          requestedAt: new Date(now.getTime() - 31 * DAY), completedAt: new Date(now.getTime() - 31 * DAY),
        },
        UniqueEntityId.create(),
      ),
    );
    const placements = new AlbumCompositionPlacementDirectory(w.albums);
    return new PurgeExpiredOriginalsUseCase(
      w.projects, w.photos, w.staging,
      new ExportPrintDeliveryDirectory(w.exportJobs, w.albums),
      placements,
      new PromoteSelectedPhotosUseCase(w.photos, w.staging, w.permanent, placements),
      30, () => now, undefined, undefined,
      storeEverything ? w.store : undefined,
    );
  }

  it("copies a not-yet-stored original before deleting the staged one — never the only copy", async () => {
    const w = await world();
    const { photo, bytes, key } = await w.addPhoto("a.jpg", { derived: true });
    const summary = await (await purger(w, new Date(), true)).execute();

    assert.equal(summary.purged, 1);
    assert.deepEqual(w.permanent.objects.get(key), bytes, "the original is on long-term storage");
    assert.equal(w.staging.objects.has(key), false, "and only then removed from staging");
    assert.ok((await w.photos.findById(photo.id))?.stagedOriginalPurgedAt);
  });

  it("keeps the staged original when it cannot be stored, and counts it as held back", async () => {
    const w = await world();
    const { key } = await w.addPhoto("a.jpg", { derived: true });
    w.permanent.failAll = true;
    const summary = await (await purger(w, new Date(), true)).execute();

    assert.equal(summary.purged, 0);
    assert.equal(summary.heldBack, 1);
    assert.ok(w.staging.objects.has(key), "the only copy is still there");
  });

  it("deletes an already-stored original without copying it again", async () => {
    const w = await world();
    const { photo, key } = await w.addPhoto("a.jpg", { derived: true });
    await w.store.execute({ photoId: photo.id.toString() });
    w.permanent.uploads = 0;
    const summary = await (await purger(w, new Date(), true)).execute();
    assert.equal(summary.purged, 1);
    assert.equal(w.permanent.uploads, 0);
    assert.ok(w.permanent.objects.has(key));
  });

  it("with 'selected only' the old rule is unchanged: an unselected original expires without being stored", async () => {
    const w = await world();
    const { key } = await w.addPhoto("a.jpg", { derived: true });
    const summary = await (await purger(w, new Date(), false)).execute();
    assert.equal(summary.purged, 1);
    assert.equal(w.permanent.objects.has(key), false);
    assert.equal(w.staging.objects.has(key), false);
  });
});

describe("the LONG_TERM_ORIGINALS setting", () => {
  const base = {
    DATABASE_URL: "x", REDIS_URL: "x", S3_ENDPOINT: "x", S3_BUCKET: "x",
    S3_ACCESS_KEY_ID: "x", S3_SECRET_ACCESS_KEY: "x", JWT_SECRET: "x".repeat(32),
  };
  it("defaults to storing every original", () => {
    assert.equal(loadEnv(base).LONG_TERM_ORIGINALS, "all");
  });
  it("can be switched back to selected-only, and rejects anything else", () => {
    assert.equal(loadEnv({ ...base, LONG_TERM_ORIGINALS: "selected" }).LONG_TERM_ORIGINALS, "selected");
    assert.throws(() => loadEnv({ ...base, LONG_TERM_ORIGINALS: "some" }));
  });
});
