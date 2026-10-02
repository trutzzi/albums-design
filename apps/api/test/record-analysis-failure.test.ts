import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { ListStudioProjectsUseCase } from "../src/modules/media-ingestion/application/use-cases/list-studio-projects/list-studio-projects.use-case";
import { MediaIngestionPhotoLifecycle } from "../src/modules/photo-intelligence/infrastructure/gateways/photo-lifecycle-gateway";
import { RecordAnalysisFailureUseCase } from "../src/modules/photo-intelligence/application/use-cases/record-analysis-failure/record-analysis-failure.use-case";
import {
  InMemoryAlbumRepository,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
} from "./support/in-memory";

async function world() {
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const studioId = UniqueEntityId.create();
  const project = Project.create({ studioId, name: "Nunta Ioana", type: "WEDDING" });
  await projects.save(project);

  async function queuedPhoto(fileName: string) {
    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId,
      fileName,
      mimeType: "image/jpeg",
      byteSize: 1000,
    });
    photo.markUploaded({ byteSize: 1000 });
    photo.markAnalysisQueued();
    await photos.save(photo);
    return photo;
  }

  return {
    photos,
    queuedPhoto,
    lifecycle: new MediaIngestionPhotoLifecycle(photos),
    recordFailure: new RecordAnalysisFailureUseCase(new MediaIngestionPhotoLifecycle(photos)),
    shoots: () =>
      new ListStudioProjectsUseCase(
        projects,
        photos,
        new InMemoryAlbumRepository(),
        new InMemoryObjectStorage(),
      ).execute(studioId.toString()),
  };
}

describe("a photo whose analysis gave up for good", () => {
  it("is marked failed, so its shoot stops counting it as still processing", async () => {
    const w = await world();
    const stuck = await w.queuedPhoto("001.jpg");
    const fine = await w.queuedPhoto("002.jpg");
    await w.lifecycle.markAnalysed(fine.id.toString());

    assert.equal((await w.shoots())[0]?.processingCount, 1);
    const result = await w.recordFailure.execute({ photoId: stuck.id.toString() });

    assert.ok(result.isSuccess);
    assert.equal((await w.photos.findById(stuck.id))?.status, "FAILED");
    const [shoot] = await w.shoots();
    assert.equal(shoot?.processingCount, 0, "nothing left to wait for: the card and its polling stop");
    assert.equal(shoot?.photoCount, 2, "a failed photo still counts as uploaded");
  });

  it("never overwrites a photo another attempt already analysed", async () => {
    const w = await world();
    const photo = await w.queuedPhoto("001.jpg");
    await w.lifecycle.markAnalysed(photo.id.toString());

    await w.recordFailure.execute({ photoId: photo.id.toString() });

    assert.equal((await w.photos.findById(photo.id))?.status, "ANALYSED");
  });

  it("ignores a photo that no longer exists (its shoot was deleted meanwhile)", async () => {
    const w = await world();
    const result = await w.recordFailure.execute({ photoId: UniqueEntityId.create().toString() });
    assert.ok(result.isSuccess);
  });
});
