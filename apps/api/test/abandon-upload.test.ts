import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { AbandonUploadUseCase } from "../src/modules/media-ingestion/application/use-cases/abandon-upload/abandon-upload.use-case";
import { InMemoryObjectStorage, InMemoryPhotoRepository, InMemoryProjectRepository } from "./support/in-memory";

async function world() {
  const storage = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const project = Project.create({ studioId: UniqueEntityId.create(), name: "Shoot", type: "WEDDING" });
  await projects.save(project);

  /** A photo the browser asked to upload; `uploaded` means its PUT finished and it was confirmed. */
  async function addPhoto(options: { uploaded?: boolean; bytesInStorage?: boolean } = {}) {
    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId: project.studioId,
      fileName: "a.jpg",
      mimeType: "image/jpeg",
      byteSize: 1000,
    });
    if (options.bytesInStorage !== false) storage.upload(photo.storageKey.toString(), new Uint8Array(1000));
    if (options.uploaded) photo.markUploaded({ byteSize: 1000 });
    await photos.save(photo);
    return photo;
  }

  return { storage, photos, project, addPhoto, abandon: new AbandonUploadUseCase(photos, storage) };
}

describe("abandoning an upload that never finished", () => {
  it("removes the row and the half-written object", async () => {
    const w = await world();
    const photo = await w.addPhoto();
    const key = photo.storageKey.toString();

    const result = await w.abandon.execute({ photoId: photo.id.toString() });
    assert.ok(result.isSuccess);
    assert.equal(await w.photos.findById(photo.id), undefined);
    assert.equal(w.storage.objects.has(key), false);
  });

  it("works when the browser was cut off before writing anything", async () => {
    const w = await world();
    const photo = await w.addPhoto({ bytesInStorage: false });
    assert.ok((await w.abandon.execute({ photoId: photo.id.toString() })).isSuccess);
    assert.equal(await w.photos.findById(photo.id), undefined);
  });

  it("refuses to touch a photo that did finish — a mistimed cancel must not lose it", async () => {
    const w = await world();
    const photo = await w.addPhoto({ uploaded: true });

    const result = await w.abandon.execute({ photoId: photo.id.toString() });
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "CONFLICT");
    assert.ok(await w.photos.findById(photo.id), "the photo is still part of the shoot");
    assert.ok(w.storage.objects.has(photo.storageKey.toString()));
  });

  it("is happy to be asked twice, or about a photo that never existed", async () => {
    const w = await world();
    const photo = await w.addPhoto();
    assert.ok((await w.abandon.execute({ photoId: photo.id.toString() })).isSuccess);
    assert.ok((await w.abandon.execute({ photoId: photo.id.toString() })).isSuccess, "cleanup may be retried");
    assert.ok((await w.abandon.execute({ photoId: UniqueEntityId.create().toString() })).isSuccess);
  });

  it("still drops the row when storage will not delete the object", async () => {
    const w = await world();
    const photo = await w.addPhoto();
    w.storage.delete = async () => {
      throw new Error("storage unreachable");
    };

    const result = await w.abandon.execute({ photoId: photo.id.toString() });
    assert.ok(result.isSuccess, "a storage hiccup must not leave a phantom photo in the shoot");
    assert.equal(await w.photos.findById(photo.id), undefined);
  });

  it("leaves the rest of the batch alone", async () => {
    const w = await world();
    const cancelled = await w.addPhoto();
    const finished = await w.addPhoto({ uploaded: true });

    await w.abandon.execute({ photoId: cancelled.id.toString() });
    const left = await w.photos.findByProjectId(w.project.id);
    assert.deepEqual(left.map((photo) => photo.id.toString()), [finished.id.toString()]);
  });
});
