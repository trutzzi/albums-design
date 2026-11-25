import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { RequestUploadUseCase } from "../src/modules/media-ingestion/application/use-cases/request-upload/request-upload.use-case";
import { httpStatusFor } from "../src/interface/error-translator";
import { InMemoryObjectStorage, InMemoryPhotoRepository, InMemoryProjectRepository } from "./support/in-memory";

async function world() {
  const projects = new InMemoryProjectRepository();
  const photos = new InMemoryPhotoRepository();
  const studioId = UniqueEntityId.create();
  const shoot = Project.create({ studioId, name: "Wedding", type: "WEDDING" });
  const otherShoot = Project.create({ studioId, name: "Engagement", type: "WEDDING" });
  await projects.save(shoot);
  await projects.save(otherShoot);
  const upload = new RequestUploadUseCase(projects, photos, new InMemoryObjectStorage());

  async function existing(
    fileName: string,
    byteSize: number,
    options: { finished?: boolean; projectId?: UniqueEntityId } = {},
  ) {
    const photo = Photo.requestUpload({
      projectId: options.projectId ?? shoot.id,
      studioId,
      fileName,
      mimeType: "image/jpeg",
      byteSize,
    });
    if (options.finished !== false) photo.markUploaded({ byteSize });
    await photos.save(photo);
  }
  const request = (fileName: string, byteSize: number, projectId = shoot.id) =>
    upload.execute({
      studioId: studioId.toString(),
      projectId: projectId.toString(),
      fileName,
      mimeType: "image/jpeg",
      byteSize,
    });
  return { photos, projects, studioId, shoot, otherShoot, existing, request };
}

describe("RequestUploadUseCase: the same file dropped twice", () => {
  it("refuses a file already in the shoot with the same name and size, and creates no row", async () => {
    const w = await world();
    await w.existing("NuntaNoastra-0056.jpg", 2_893_167);
    const before = (await w.photos.findByProjectId(w.shoot.id)).length;

    const result = await w.request("NuntaNoastra-0056.jpg", 2_893_167);

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "ALREADY_UPLOADED");
    assert.equal(httpStatusFor(result.getError()), 409);
    assert.equal((await w.photos.findByProjectId(w.shoot.id)).length, before);
  });

  it("accepts a different file that only shares the name: an edited export is a new photo", async () => {
    const w = await world();
    await w.existing("huk (1).jpeg", 635_003);
    assert.ok((await w.request("huk (1).jpeg", 7_246_731)).isSuccess);
  });

  it("accepts the file again when its earlier upload never finished", async () => {
    const w = await world();
    await w.existing("cut-off.jpg", 4_000_000, { finished: false });
    assert.ok((await w.request("cut-off.jpg", 4_000_000)).isSuccess);
  });

  it("answers 'already there' even when the shoot is at its plan limit", async () => {
    const w = await world();
    await w.existing("full.jpg", 1234);
    const full = new RequestUploadUseCase(w.projects, w.photos, new InMemoryObjectStorage(), {
      forProject: async () => ({ maxPhotosPerShoot: 1 }),
    } as never);
    const result = await full.execute({
      studioId: w.studioId.toString(),
      projectId: w.shoot.id.toString(),
      fileName: "full.jpg",
      mimeType: "image/jpeg",
      byteSize: 1234,
    });
    assert.equal(result.isFailure && result.getError().code, "ALREADY_UPLOADED");
  });

  it("accepts the same file in another shoot", async () => {
    const w = await world();
    await w.existing("shared.jpg", 3_000_000, { projectId: w.otherShoot.id });
    assert.ok((await w.request("shared.jpg", 3_000_000)).isSuccess);
  });
});
