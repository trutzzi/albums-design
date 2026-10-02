import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album, FULL_CROP } from "../src/modules/album-composition/domain/album";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { AlbumCompositionGateway } from "../src/modules/review-collaboration/infrastructure/gateways/album-gateway";
import { StoragePhotoPreviewResolver } from "../src/modules/review-collaboration/infrastructure/gateways/photo-preview-resolver";
import { InMemoryAlbumRepository, InMemoryObjectStorage, InMemoryPhotoRepository } from "./support/in-memory";

describe("the album a client reviews", () => {
  it("resolves every photo's preview in one lookup, not one per photo", async () => {
    const photos = new InMemoryPhotoRepository();
    const albums = new InMemoryAlbumRepository();
    const projectId = UniqueEntityId.create();
    const placed: Photo[] = [];
    for (let i = 0; i < 12; i++) {
      const photo = Photo.requestUpload({
        projectId,
        studioId: UniqueEntityId.create(),
        fileName: `${i}.jpg`,
        mimeType: "image/jpeg",
        byteSize: 1000,
      });
      photo.markUploaded({ byteSize: 1000 });
      if (i % 2 === 0) photo.markDerivativesReady();
      await photos.save(photo);
      placed.push(photo);
    }
    const spreads = [0, 1, 2, 3].map((spread) => ({
      templateId: "three-up",
      placements: placed.slice(spread * 3, spread * 3 + 3).map((photo, slot) => ({
        slotId: `s${slot}`,
        photoId: photo.id.toString(),
        crop: FULL_CROP,
        treatment: "COLOR" as const,
      })),
    }));
    const album = Album.create({ projectId, title: "Main", spreads });
    await albums.save(album);

    let single = 0;
    let batched = 0;
    const findById = photos.findById.bind(photos);
    const findByIds = photos.findByIds.bind(photos);
    photos.findById = async (id) => {
      single++;
      return findById(id);
    };
    photos.findByIds = async (ids) => {
      batched++;
      return findByIds(ids);
    };

    const gateway = new AlbumCompositionGateway(
      albums,
      new StoragePhotoPreviewResolver(photos, new InMemoryObjectStorage()),
    );
    const view = await gateway.load(album.id.toString());

    assert.equal(batched, 1);
    assert.equal(single, 0);
    const urls = view!.spreads.flatMap((spread) => spread.placements.map((placement) => placement.previewUrl));
    assert.equal(urls.length, 12);
    placed.forEach((photo, index) => {
      // Display copies when they exist, the original until then — as before batching.
      const key = photo.hasDerivatives ? photo.storageKey.derivative("preview") : photo.storageKey;
      assert.ok(urls[index]?.includes(key.toString()), `${photo.fileName}: ${urls[index]}`);
    });
  });

  it("shows no preview for a photo deleted after it was placed", async () => {
    const albums = new InMemoryAlbumRepository();
    const album = Album.create({
      projectId: UniqueEntityId.create(),
      title: "Main",
      spreads: [
        {
          templateId: "single",
          placements: [
            { slotId: "s0", photoId: UniqueEntityId.create().toString(), crop: FULL_CROP, treatment: "COLOR" },
          ],
        },
      ],
    });
    await albums.save(album);
    const gateway = new AlbumCompositionGateway(
      albums,
      new StoragePhotoPreviewResolver(new InMemoryPhotoRepository(), new InMemoryObjectStorage()),
    );
    const view = await gateway.load(album.id.toString());
    assert.equal(view!.spreads[0]!.placements[0]!.previewUrl, null);
  });
});
