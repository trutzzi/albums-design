import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album } from "../src/modules/album-composition/domain/album";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { ListStudioProjectsUseCase } from "../src/modules/media-ingestion/application/use-cases/list-studio-projects/list-studio-projects.use-case";
import {
  InMemoryAlbumRepository,
  InMemoryObjectStorage,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
} from "./support/in-memory";

async function world() {
  const storage = new InMemoryObjectStorage();
  const photos = new InMemoryPhotoRepository();
  const projects = new InMemoryProjectRepository();
  const albums = new InMemoryAlbumRepository();
  const studioId = UniqueEntityId.create();

  async function addProject(name: string, extra: { clientName?: string } = {}) {
    const project = Project.create({ studioId, name, type: "WEDDING", ...extra });
    await projects.save(project);
    return project;
  }

  /** A photo as it exists after upload; `derivatives` means a thumbnail is ready to show. */
  async function addPhoto(
    project: Project,
    fileName: string,
    options: { uploaded?: boolean; derivatives?: boolean } = {},
  ) {
    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId: project.studioId,
      fileName,
      mimeType: "image/jpeg",
      byteSize: 1000,
    });
    if (options.uploaded !== false) photo.markUploaded({ byteSize: 1000 });
    if (options.derivatives) photo.markDerivativesReady();
    await photos.save(photo);
    return photo;
  }

  return {
    storage,
    photos,
    albums,
    studioId,
    addProject,
    addPhoto,
    list: new ListStudioProjectsUseCase(projects, photos, albums, storage),
  };
}

describe("the shoots list a photographer lands on", () => {
  it("carries the counts and the cover each card needs", async () => {
    const w = await world();
    const project = await w.addProject("Alex & Alexandra", { clientName: "Alexandra" });
    await w.addPhoto(project, "002.jpg", { derivatives: true });
    await w.addPhoto(project, "001.jpg", { derivatives: true });
    await w.albums.save(Album.create({ projectId: project.id, title: "Main", spreads: [] }));

    const [summary] = await w.list.execute(w.studioId.toString());
    assert.equal(summary?.name, "Alex & Alexandra");
    assert.equal(summary?.clientName, "Alexandra");
    assert.equal(summary?.photoCount, 2);
    assert.equal(summary?.albumCount, 1);
    assert.ok(summary?.coverThumbnailUrl, "a shoot with processed photos shows one on its card");
  });

  it("does not count photos that are still uploading", async () => {
    const w = await world();
    const project = await w.addProject("Botez Maria");
    await w.addPhoto(project, "001.jpg");
    await w.addPhoto(project, "002.jpg", { uploaded: false });

    const [summary] = await w.list.execute(w.studioId.toString());
    assert.equal(summary?.photoCount, 1, "a half-finished batch must not inflate the card");
  });

  it("leaves a brand-new shoot without a cover instead of failing", async () => {
    const w = await world();
    await w.addProject("Corporate gala");

    const [summary] = await w.list.execute(w.studioId.toString());
    assert.equal(summary?.photoCount, 0);
    assert.equal(summary?.albumCount, 0);
    assert.equal(summary?.coverThumbnailUrl, null);
  });

  it("skips the cover of a shoot whose photos have no thumbnail yet", async () => {
    const w = await world();
    const project = await w.addProject("Just uploaded");
    await w.addPhoto(project, "001.jpg");

    const [summary] = await w.list.execute(w.studioId.toString());
    assert.equal(summary?.photoCount, 1);
    assert.equal(summary?.coverThumbnailUrl, null, "the thumbnail is still being generated");
  });

  it("keeps the list up when a cover cannot be signed", async () => {
    const w = await world();
    const project = await w.addProject("Alex & Alexandra");
    await w.addPhoto(project, "001.jpg", { derivatives: true });
    w.storage.presignGet = async () => {
      throw new Error("storage unreachable");
    };

    const [summary] = await w.list.execute(w.studioId.toString());
    assert.equal(summary?.coverThumbnailUrl, null, "one missing cover must not cost the whole page");
    assert.equal(summary?.photoCount, 1);
  });

  it("counts each shoot separately", async () => {
    const w = await world();
    const first = await w.addProject("First");
    const second = await w.addProject("Second");
    await w.addPhoto(first, "001.jpg");
    await w.addPhoto(second, "001.jpg");
    await w.addPhoto(second, "002.jpg");

    const summaries = await w.list.execute(w.studioId.toString());
    const byName = new Map(summaries.map((summary) => [summary.name, summary.photoCount]));
    assert.deepEqual([byName.get("First"), byName.get("Second")], [1, 2]);
  });

  it("returns nothing for a studio with no shoots", async () => {
    const w = await world();
    assert.deepEqual(await w.list.execute(UniqueEntityId.create().toString()), []);
  });
});
