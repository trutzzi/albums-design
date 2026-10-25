import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { MAX_UPLOAD_BYTES } from "@albumflow/contracts";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { ConfirmUploadUseCase } from "../src/modules/media-ingestion/application/use-cases/confirm-upload/confirm-upload.use-case";
import type { ObjectHead } from "../src/modules/media-ingestion/application/ports/object-storage";
import { InMemoryJobQueue, InMemoryObjectStorage, InMemoryPhotoRepository } from "./support/in-memory";
import { RecordingLogger } from "./support/recording-logger";

/** Reports whatever size the browser actually wrote, without holding 75MB in a test. */
class SizedStorage extends InMemoryObjectStorage {
  constructor(private readonly landedBytes: number) {
    super();
  }
  override async headObject(key: string): Promise<ObjectHead | undefined> {
    return this.objects.has(key) ? { byteSize: this.landedBytes, etag: '"x"' } : undefined;
  }
}

async function pendingUpload(landedBytes: number) {
  const photos = new InMemoryPhotoRepository();
  const storage = new SizedStorage(landedBytes);
  const queue = new InMemoryJobQueue();
  const logger = new RecordingLogger();
  // The browser asked for a small file — the presigned URL does not hold it to that.
  const photo = Photo.requestUpload({
    projectId: UniqueEntityId.create(),
    studioId: UniqueEntityId.create(),
    fileName: "IMG_0001.jpg",
    mimeType: "image/jpeg",
    byteSize: 1024,
  });
  await photos.save(photo);
  storage.upload(photo.storageKey.toString(), new Uint8Array(8));
  const confirm = new ConfirmUploadUseCase(photos, storage, queue, false, logger);
  return { photos, storage, queue, logger, photo, confirm };
}

describe("upload size, as actually stored", () => {
  it("rejects an object over the limit even though the request claimed less, and removes it", async () => {
    const { photos, storage, queue, logger, photo, confirm } = await pendingUpload(MAX_UPLOAD_BYTES + 1);

    const result = await confirm.execute({ photoId: photo.id.toString() });

    assert.ok(result.isFailure);
    assert.match(result.getError().message, /75MB/);
    assert.equal(await photos.findById(photo.id), undefined, "the pending row stayed behind");
    assert.equal(storage.objects.has(photo.storageKey.toString()), false, "the oversized object stayed in storage");
    assert.equal(queue.jobs.length, 0, "an oversized file was queued for decoding");
    assert.equal(logger.problems.length, 1);
  });

  it("keeps the row when the object cannot be deleted, so the upload can still be cleaned up", async () => {
    const { photos, storage, logger, photo, confirm } = await pendingUpload(MAX_UPLOAD_BYTES + 1);
    storage.delete = async () => {
      throw new Error("storage unreachable");
    };

    const result = await confirm.execute({ photoId: photo.id.toString() });

    assert.ok(result.isFailure);
    assert.equal((await photos.findById(photo.id))?.status, "PENDING_UPLOAD");
    assert.ok(
      logger.entries.some((entry) => entry.level === "error"),
      "an orphaned 75MB+ object must reach the Errors tab",
    );
  });

  it("accepts a file of exactly the limit", async () => {
    const { photos, photo, confirm } = await pendingUpload(MAX_UPLOAD_BYTES);
    const result = await confirm.execute({ photoId: photo.id.toString() });
    assert.ok(result.isSuccess);
    assert.equal((await photos.findById(photo.id))?.byteSize, MAX_UPLOAD_BYTES);
  });

  it("never deletes a photo that is already part of the shoot", async () => {
    const { photos, storage, photo, confirm } = await pendingUpload(MAX_UPLOAD_BYTES + 1);
    // Confirmed before this check existed: a repeated confirm must not throw it away.
    photo.markUploaded({ byteSize: MAX_UPLOAD_BYTES + 1 });
    await photos.save(photo);

    await assert.rejects(confirm.execute({ photoId: photo.id.toString() }));
    assert.ok(await photos.findById(photo.id));
    assert.ok(storage.objects.has(photo.storageKey.toString()));
  });
});
