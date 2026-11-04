import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { ReleaseStagedOriginalsUseCase } from "../src/modules/media-ingestion/application/use-cases/release-staged-originals/release-staged-originals.use-case";
import { StoreOriginalUseCase } from "../src/modules/media-ingestion/application/use-cases/store-original/store-original.use-case";
import { StorePendingOriginalsUseCase } from "../src/modules/media-ingestion/application/use-cases/store-original/store-pending-originals.use-case";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";
import { InMemoryStorageProvider } from "../src/dev/in-memory-storage-provider";
import { silentLogger } from "../src/shared-kernel/logger";
import { InMemoryObjectStorage, InMemoryPhotoRepository } from "./support/in-memory";
import { RecordingLogger } from "./support/recording-logger";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-04T12:00:00Z");

/** Long-term storage that can be made unreachable, to prove nothing is deleted while it is down. */
class UnreliableProvider extends InMemoryStorageProvider {
  down = false;
  heads = 0;
  override async head(key: string) {
    this.heads++;
    if (this.down) throw new Error("socket hang up");
    return super.head(key);
  }
}

function world(options: { keepDays?: number } = {}) {
  const permanent = new UnreliableProvider(
    new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test"),
  );
  const staging = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const logger = new RecordingLogger();
  let clock = NOW.getTime();
  const release = new ReleaseStagedOriginalsUseCase(
    photos,
    staging,
    permanent,
    options.keepDays ?? 2,
    logger,
    () => new Date(clock),
  );

  /**
   * One uploaded photo. `storedDaysAgo` marks it stored long-term that long ago; `onLongTerm`
   * says what DigiStorage really holds: the whole file, a cut-short copy, or nothing.
   */
  async function addPhoto(
    name: string,
    setup: {
      storedDaysAgo?: number;
      onLongTerm?: "whole" | "partial" | "none";
      analysed?: boolean;
      derived?: boolean;
    } = {},
  ) {
    const bytes = Buffer.from(`original of ${name} `.repeat(30));
    const photo = Photo.requestUpload({
      projectId: UniqueEntityId.create(),
      studioId: UniqueEntityId.create(),
      fileName: name,
      mimeType: "image/jpeg",
      byteSize: bytes.byteLength,
    });
    const key = photo.storageKey.toString();
    staging.upload(key, new Uint8Array(bytes));
    photo.markUploaded({ byteSize: bytes.byteLength });
    if (setup.analysed !== false) {
      photo.markAnalysisQueued();
      photo.markAnalysed();
    }
    if (setup.derived !== false) photo.markDerivativesReady({ permanent: true });
    if (setup.storedDaysAgo !== undefined) photo.markFullResStored(new Date(NOW.getTime() - setup.storedDaysAgo * DAY));
    const onLongTerm = setup.onLongTerm ?? (setup.storedDaysAgo !== undefined ? "whole" : "none");
    if (onLongTerm === "whole") await permanent.upload(key, bytes, { contentType: "image/jpeg" });
    if (onLongTerm === "partial") await permanent.upload(key, bytes.subarray(0, 100), { contentType: "image/jpeg" });
    await photos.save(photo);
    return { photo, key, bytes };
  }

  const staged = async (key: string) => Boolean(await staging.headObject(key));
  const reload = async (photo: Photo) => (await photos.findById(photo.id))!;
  const advance = (ms: number) => {
    clock += ms;
  };
  return { permanent, staging, photos, logger, release, addPhoto, staged, reload, advance };
}

describe("ReleaseStagedOriginalsUseCase: the server keeps only display copies", () => {
  it("deletes the server copy of an original verified on long-term storage for long enough", async () => {
    const w = world();
    const { photo, key, bytes } = await w.addPhoto("old.jpg", { storedDaysAgo: 3 });

    const summary = await w.release.execute();

    assert.deepEqual(summary, {
      released: 1,
      freedBytes: bytes.byteLength,
      missing: 0,
      failed: 0,
      stoppedEarly: false,
    });
    assert.equal(await w.staged(key), false);
    assert.ok((await w.reload(photo)).stagedOriginalPurgedAt);
    // The only copy left is the long-term one, untouched.
    assert.equal((await w.permanent.head(key))?.size, bytes.byteLength);
    assert.equal(w.logger.problems.length, 0);
  });

  it("does not need the album to have been exported: a shoot nobody exported is released too", async () => {
    const w = world();
    const { key } = await w.addPhoto("never-exported.jpg", { storedDaysAgo: 2 });
    assert.equal((await w.release.execute()).released, 1);
    assert.equal(await w.staged(key), false);
  });

  it("keeps originals stored more recently than the delay, and ones not on long-term storage at all", async () => {
    const w = world({ keepDays: 2 });
    const recent = await w.addPhoto("recent.jpg", { storedDaysAgo: 1 });
    const notStored = await w.addPhoto("not-stored.jpg");

    assert.equal((await w.release.execute()).released, 0);
    assert.equal(await w.staged(recent.key), true);
    assert.equal(await w.staged(notStored.key), true);
  });

  it("keeps originals that analysis or the display copies still need", async () => {
    const w = world();
    const unanalysed = await w.addPhoto("queued.jpg", { storedDaysAgo: 5, analysed: false });
    const noPreviews = await w.addPhoto("no-previews.jpg", { storedDaysAgo: 5, derived: false });

    assert.equal((await w.release.execute()).released, 0);
    assert.equal(await w.staged(unanalysed.key), true);
    assert.equal(await w.staged(noPreviews.key), true);
  });

  it("never trusts the 'stored' mark: a photo missing on long-term storage keeps its server copy and is copied again", async () => {
    const w = world();
    const missing = await w.addPhoto("missing.jpg", { storedDaysAgo: 5, onLongTerm: "none" });
    const partial = await w.addPhoto("partial.jpg", { storedDaysAgo: 5, onLongTerm: "partial" });

    const summary = await w.release.execute();

    assert.equal(summary.released, 0);
    assert.equal(summary.missing, 2);
    assert.equal(await w.staged(missing.key), true);
    assert.equal(await w.staged(partial.key), true);
    assert.equal((await w.reload(missing.photo)).fullResStoredAt, undefined);
    assert.equal((await w.reload(partial.photo)).fullResStoredAt, undefined);
    // One error for the run (admin Errors tab), naming the photos.
    const errors = w.logger.entries.filter((entry) => entry.level === "error");
    assert.equal(errors.length, 1);
    assert.deepEqual(errors[0]!.context, { count: 2, photos: ["missing.jpg", "partial.jpg"] });

    // The store sweep picks them up again and copies them whole; a later run then releases them.
    const store = new StoreOriginalUseCase(w.photos, w.staging, w.permanent, () => NOW);
    const stored = await new StorePendingOriginalsUseCase(w.photos, store, Date.now, silentLogger).execute();
    assert.equal(stored.stored, 2);
    w.advance(3 * DAY);
    assert.equal((await w.release.execute()).released, 2);
    assert.equal((await w.permanent.head(partial.key))?.size, partial.bytes.byteLength);
  });

  it("deletes nothing while long-term storage is unreachable, and gives up after a few failures in a row", async () => {
    const w = world();
    const added = [];
    for (let i = 0; i < 8; i++) added.push(await w.addPhoto(`p${i}.jpg`, { storedDaysAgo: 5 }));
    w.permanent.down = true;

    const summary = await w.release.execute();

    assert.equal(summary.released, 0);
    assert.equal(summary.failed, 5);
    assert.equal(summary.stoppedEarly, true);
    assert.equal(w.permanent.heads, 5);
    for (const { key, photo } of added) {
      assert.equal(await w.staged(key), true);
      // An outage is not proof the copy is missing: the mark stays, the next run checks again.
      assert.ok((await w.reload(photo)).fullResStoredAt);
    }

    w.permanent.down = false;
    assert.equal((await w.release.execute()).released, 8);
  });

  it("works through a backlog in batches, and stops when its time is up", async () => {
    const w = world();
    for (let i = 0; i < 5; i++) await w.addPhoto(`b${i}.jpg`, { storedDaysAgo: 10 - i });
    assert.equal((await w.release.execute({ batchSize: 2 })).released, 5);

    for (let i = 0; i < 3; i++) await w.addPhoto(`c${i}.jpg`, { storedDaysAgo: 4 });
    const timedOut = await w.release.execute({ budgetMs: 0 });
    assert.equal(timedOut.released, 0);
    assert.equal(timedOut.stoppedEarly, true);
  });

  it("runs one sweep at a time", async () => {
    const w = world();
    await w.addPhoto("a.jpg", { storedDaysAgo: 3 });
    const [first, second] = await Promise.all([w.release.execute(), w.release.execute()]);
    assert.equal(first.released, 1);
    assert.equal(second.alreadyRunning, true);
    assert.equal(second.released, 0);
  });
});
