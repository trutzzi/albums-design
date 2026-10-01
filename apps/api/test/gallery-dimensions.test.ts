import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { ListProjectPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { MediaIngestionPickGateway } from "../src/modules/review-collaboration/infrastructure/gateways/pick-gateway";
import type { PhotoDimensionsDirectory } from "../src/shared-kernel/photo-dimensions";
import { InMemoryObjectStorage, InMemoryPhotoRepository, InMemoryProjectRepository } from "./support/in-memory";

describe("the client gallery's photo sizes", () => {
  it("gives each photo its upright size, and null while it is not analysed yet", async () => {
    const projects = new InMemoryProjectRepository();
    const photos = new InMemoryPhotoRepository();
    const project = Project.create({ studioId: UniqueEntityId.create(), name: "Wedding", type: "WEDDING" });
    await projects.save(project);
    const add = async (fileName: string) => {
      const photo = Photo.requestUpload({
        projectId: project.id,
        studioId: project.studioId,
        fileName,
        mimeType: "image/jpeg",
        byteSize: 1000,
      });
      photo.markUploaded({ byteSize: 1000 });
      photo.markDerivativesReady();
      await photos.save(photo);
      return photo;
    };
    const portrait = await add("001.jpg");
    const fresh = await add("002.jpg");
    const dimensions: PhotoDimensionsDirectory = {
      forProject: async () => new Map([[portrait.id.toString(), { width: 4000, height: 6000 }]]),
    };
    const gateway = new MediaIngestionPickGateway(
      projects,
      photos,
      new ListProjectPhotosUseCase(photos, new InMemoryObjectStorage()),
      { dimensions },
    );

    const listed = new Map((await gateway.listPhotos(project.id.toString())).map((photo) => [photo.id, photo]));
    assert.deepEqual(
      { width: listed.get(portrait.id.toString())?.width, height: listed.get(portrait.id.toString())?.height },
      { width: 4000, height: 6000 },
    );
    assert.equal(listed.get(fresh.id.toString())?.width, null, "the gallery falls back to the image's own size");
  });
});
