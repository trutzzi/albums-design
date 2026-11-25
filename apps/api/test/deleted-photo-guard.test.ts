import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { DeletedPhotoGuard } from "../src/modules/media-ingestion/application/services/deleted-photo-guard";
import { InMemoryPhotoRepository } from "./support/in-memory";

async function world() {
  const photos = new InMemoryPhotoRepository();
  const photo = Photo.requestUpload({
    projectId: UniqueEntityId.create(),
    studioId: UniqueEntityId.create(),
    fileName: "a.jpg",
    mimeType: "image/jpeg",
    byteSize: 100,
  });
  await photos.save(photo);
  return { photos, photo, id: photo.id.toString(), guard: new DeletedPhotoGuard(photos) };
}

describe("DeletedPhotoGuard: jobs for photos of a deleted shoot", () => {
  it("runs the job for a photo that exists, and passes its result on", async () => {
    const w = await world();
    assert.deepEqual(await w.guard.run(w.id, async () => ({ done: true })), { done: true });
  });

  it("skips the job, without running it, when the photo is already gone", async () => {
    const w = await world();
    await w.photos.delete(w.photo.id);
    let ran = false;
    const result = await w.guard.run(w.id, async () => {
      ran = true;
      return {};
    });
    assert.equal(ran, false);
    assert.deepEqual(result, { photoId: w.id, skipped: "photo deleted" });
  });

  it("turns a failure into a quiet skip when the photo was deleted while the job ran", async () => {
    const w = await world();
    const result = await w.guard.run(w.id, async () => {
      await w.photos.delete(w.photo.id);
      throw new Error("NoSuchKey: The specified key does not exist.");
    });
    assert.deepEqual(result, { photoId: w.id, skipped: "photo deleted" });
  });

  it("removes display copies a job wrote after its photo was deleted", async () => {
    const photos = new InMemoryPhotoRepository();
    const photo = Photo.requestUpload({
      projectId: UniqueEntityId.create(),
      studioId: UniqueEntityId.create(),
      fileName: "late.jpg",
      mimeType: "image/jpeg",
      byteSize: 100,
    });
    await photos.save(photo);
    const removed: string[] = [];
    const guard = new DeletedPhotoGuard(photos, async (gone) => void removed.push(gone.id.toString()));

    const result = await guard.run(photo.id.toString(), async () => {
      // The shoot is deleted while the previews are being written.
      await photos.delete(photo.id);
      return { thumbKb: 20 };
    });

    assert.deepEqual(result, { photoId: photo.id.toString(), skipped: "photo deleted" });
    assert.deepEqual(removed, [photo.id.toString()]);
  });

  it("keeps the job's own error when the photo cannot be looked up", async () => {
    const w = await world();
    let lookups = 0;
    const flaky = new DeletedPhotoGuard({
      findById: async (id: UniqueEntityId) => {
        lookups++;
        if (lookups > 1) throw new Error("database is down");
        return w.photos.findById(id);
      },
    } as never);
    await assert.rejects(
      flaky.run(w.id, async () => {
        throw new Error("sharp: corrupt JPEG");
      }),
      /corrupt JPEG/,
    );
  });

  it("still fails the job when the photo exists: a real problem stays an error", async () => {
    const w = await world();
    await assert.rejects(
      w.guard.run(w.id, async () => {
        throw new Error("sharp: corrupt JPEG");
      }),
      /corrupt JPEG/,
    );
  });
});
