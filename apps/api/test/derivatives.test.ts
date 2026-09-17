import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { StorageKey } from "../src/modules/media-ingestion/domain/value-objects/storage-key";
import { ConfirmUploadUseCase } from "../src/modules/media-ingestion/application/use-cases/confirm-upload/confirm-upload.use-case";
import {
  DERIVATIVE_SPECS,
  GenerateDerivativesUseCase,
} from "../src/modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { ListProjectPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { SharpImageResizer } from "../src/modules/media-ingestion/infrastructure/imaging/sharp-image-resizer";
import { StoredPhotoResolver } from "../src/modules/export-print/infrastructure/gateways/album-gateway";
import {
  InMemoryJobQueue,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
} from "./support/in-memory";

const PROJECT = UniqueEntityId.create();
const STUDIO = UniqueEntityId.create();

/** A camera-sized frame, which is what actually lands in the tray. */
async function cameraJpeg(width = 3648, height = 5472): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function uploadedPhoto(storage: InMemoryObjectStorage, photos: InMemoryPhotoRepository) {
  const photo = Photo.requestUpload({
    projectId: PROJECT,
    studioId: STUDIO,
    fileName: "IMG_1141.jpg",
    mimeType: "image/jpeg",
    byteSize: 1,
  });
  const original = await cameraJpeg();
  storage.upload(photo.storageKey.toString(), new Uint8Array(original));
  photo.markUploaded({ byteSize: original.byteLength });
  await photos.save(photo);
  return { photo, original };
}

describe("display derivatives", () => {
  it("keys a derivative beside the original rather than over it", () => {
    const key = StorageKey.fromExisting("studios/s/projects/p/originals/abc.JPG");
    assert.equal(key.derivative("thumb").toString(), "studios/s/projects/p/derivatives/abc-thumb.jpg");
    assert.equal(
      key.derivative("preview").toString(),
      "studios/s/projects/p/derivatives/abc-preview.jpg",
    );
    // The original must survive untouched — it is what gets printed.
    assert.equal(key.toString(), "studios/s/projects/p/originals/abc.JPG");
  });

  it("shrinks a camera frame to something a browser can actually draw", async () => {
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const { photo, original } = await uploadedPhoto(storage, photos);

    const result = await new GenerateDerivativesUseCase(
      photos,
      storage,
      new SharpImageResizer(),
    ).execute({ photoId: photo.id.toString() });

    assert.ok(result.isSuccess);
    const { written } = result.getValue();

    const thumb = await sharp(
      await storage.getObject(photo.storageKey.derivative("thumb").toString()),
    ).metadata();
    const preview = await sharp(
      await storage.getObject(photo.storageKey.derivative("preview").toString()),
    ).metadata();

    assert.equal(Math.max(thumb.width ?? 0, thumb.height ?? 0), DERIVATIVE_SPECS.thumb.longestEdge);
    assert.equal(
      Math.max(preview.width ?? 0, preview.height ?? 0),
      DERIVATIVE_SPECS.preview.longestEdge,
    );

    // The aspect ratio must survive, or every crop in the editor would shift.
    const ratio = (meta: sharp.Metadata) => (meta.width ?? 1) / (meta.height ?? 1);
    assert.ok(Math.abs(ratio(thumb) - 3648 / 5472) < 0.01);
    assert.ok(Math.abs(ratio(preview) - 3648 / 5472) < 0.01);

    assert.ok(
      written.thumb < original.byteLength / 10,
      `a thumbnail of ${written.thumb} bytes is no saving on ${original.byteLength}`,
    );
    assert.ok(written.preview < original.byteLength);
  });

  it("hands the editor the derivatives once they exist, and the original before that", async () => {
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const { photo } = await uploadedPhoto(storage, photos);
    const list = new ListProjectPhotosUseCase(photos, storage);

    const before = await list.execute(PROJECT.toString());
    // Until the derivatives land, a photo is still visible rather than blank.
    assert.equal(before[0]?.previewUrl, `memory://${photo.storageKey.toString()}`);
    assert.equal(before[0]?.thumbnailUrl, before[0]?.previewUrl);

    await new GenerateDerivativesUseCase(photos, storage, new SharpImageResizer()).execute({
      photoId: photo.id.toString(),
    });

    const after = await list.execute(PROJECT.toString());
    assert.equal(
      after[0]?.previewUrl,
      `memory://${photo.storageKey.derivative("preview").toString()}`,
    );
    assert.equal(
      after[0]?.thumbnailUrl,
      `memory://${photo.storageKey.derivative("thumb").toString()}`,
    );
    // Never the original: that is the whole point.
    assert.notEqual(after[0]?.previewUrl, `memory://${photo.storageKey.toString()}`);
  });

  it("queues the display copies as soon as an upload is confirmed", async () => {
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const queue = new InMemoryJobQueue();

    const photo = Photo.requestUpload({
      projectId: PROJECT,
      studioId: STUDIO,
      fileName: "IMG_1050.jpg",
      mimeType: "image/jpeg",
      byteSize: 1,
    });
    await photos.save(photo);
    storage.upload(photo.storageKey.toString(), new Uint8Array(await cameraJpeg(64, 64)));

    const result = await new ConfirmUploadUseCase(photos, storage, queue).execute({
      photoId: photo.id.toString(),
    });
    assert.ok(result.isSuccess);

    const derivativeJob = queue.jobs.find((job) => job.name === "generate-derivatives");
    assert.ok(derivativeJob, "confirming an upload did not ask for display copies");
    assert.equal(derivativeJob.queue, "media-ingestion");
    assert.equal(derivativeJob.payload.photoId, photo.id.toString());

    // Analysis still happens; the two are independent pieces of work.
    assert.ok(queue.jobs.some((job) => job.name === "analyze-photo"));
  });

  it("still prints from the original, never from a display copy", async () => {
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const { photo, original } = await uploadedPhoto(storage, photos);
    await new GenerateDerivativesUseCase(photos, storage, new SharpImageResizer()).execute({
      photoId: photo.id.toString(),
    });

    const resolver = new StoredPhotoResolver(photos, storage);
    const printed = await resolver.resolve(photo.id.toString());

    assert.ok(printed);
    // Byte-for-byte the file the camera produced. A 1600px preview would print
    // visibly soft at album size, so this invariant matters more than any saving.
    assert.equal(printed.byteLength, original.byteLength);
    assert.deepEqual(Buffer.from(printed), original);
  });

  it("regenerates without complaint, so a broken derivative can be repaired", async () => {
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const { photo } = await uploadedPhoto(storage, photos);
    const useCase = new GenerateDerivativesUseCase(photos, storage, new SharpImageResizer());

    assert.ok((await useCase.execute({ photoId: photo.id.toString() })).isSuccess);
    assert.ok((await useCase.execute({ photoId: photo.id.toString() })).isSuccess);
    assert.equal((await photos.findById(photo.id))?.hasDerivatives, true);
  });
});
