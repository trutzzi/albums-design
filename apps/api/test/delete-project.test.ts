import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { PhotoAnalysis } from "../src/modules/photo-intelligence/domain/photo-analysis";
import { Album, FULL_CROP } from "../src/modules/album-composition/domain/album";
import { ExportJob } from "../src/modules/export-print/domain/export-job";
import { ReviewSession } from "../src/modules/review-collaboration/domain/review-session";
import { DeleteProjectUseCase } from "../src/modules/media-ingestion/application/use-cases/delete-project/delete-project.use-case";
import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryObjectStorage,
  InMemoryPhotoAnalysisRepository,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
} from "./support/in-memory";

function makeAlbum(projectId: UniqueEntityId): Album {
  return Album.create({
    projectId,
    title: "Golden Hour Wedding",
    spreads: [
      {
        templateId: "hero-full-bleed",
        placements: [
          { slotId: "hero", photoId: "photo-1", crop: { ...FULL_CROP }, treatment: "COLOR" },
        ],
      },
    ],
  });
}

describe("deleting a project", () => {
  it("removes the shoot along with its photos, analyses, albums, exports and review sessions", async () => {
    const projects = new InMemoryProjectRepository();
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const analyses = new InMemoryPhotoAnalysisRepository();
    const albums = new InMemoryAlbumRepository();
    const exportJobs = new InMemoryExportJobRepository();
    const reviewSessions = new InMemoryReviewSessionRepository();

    const project = Project.create({
      studioId: UniqueEntityId.create(),
      name: "Elena & Radu",
      type: "WEDDING",
    });
    await projects.save(project);

    const photo = Photo.requestUpload({
      projectId: project.id,
      studioId: project.studioId,
      fileName: "ceremony.jpg",
      mimeType: "image/jpeg",
    });
    await photos.save(photo);
    storage.upload(photo.storageKey.toString(), new Uint8Array([1, 2, 3]));
    storage.upload(photo.storageKey.derivative("thumb").toString(), new Uint8Array([4]));
    storage.upload(photo.storageKey.derivative("preview").toString(), new Uint8Array([5]));

    const analysis = PhotoAnalysis.record({
      photoId: photo.id,
      projectId: project.id,
      components: { sharpness: 80, exposure: 80, composition: 80, faceQuality: 80 },
      category: "PORTRAIT",
      categoryConfidence: 0.9,
      width: 1000,
      height: 1500,
      faceCount: 1,
    });
    await analyses.save(analysis);

    const album = makeAlbum(project.id);
    await albums.save(album);

    const job = ExportJob.request({ albumId: album.id, printProfileId: "client-proof-150" });
    job.markReady({ storageKey: "exports/a.pdf", byteSize: 1024, pageCount: 1 });
    await exportJobs.save(job);
    storage.upload("exports/a.pdf", new Uint8Array([9]));

    const { session } = ReviewSession.open({ albumId: album.id, clientName: "Elena & Radu" });
    await reviewSessions.save(session);

    const useCase = new DeleteProjectUseCase(
      projects,
      photos,
      storage,
      analyses,
      albums,
      exportJobs,
      storage,
      reviewSessions,
    );
    const result = await useCase.execute({ projectId: project.id.toString() });

    assert.ok(result.isSuccess);
    assert.equal(await projects.findById(project.id), undefined);
    assert.equal(await photos.findById(photo.id), undefined);
    assert.equal(await analyses.findByPhotoId(photo.id), undefined);
    assert.equal(await albums.findById(album.id), undefined);
    assert.equal(await exportJobs.findById(job.id), undefined);
    assert.equal(await reviewSessions.findById(session.id), undefined);
    assert.equal(storage.objects.has(photo.storageKey.toString()), false, "the original should be gone");
    assert.equal(
      storage.objects.has(photo.storageKey.derivative("thumb").toString()),
      false,
      "the thumb derivative should be gone",
    );
    assert.equal(storage.objects.has("exports/a.pdf"), false, "the stored PDF should be gone too");
  });

  it("refuses while an album still has an export in progress, leaving everything in place", async () => {
    const projects = new InMemoryProjectRepository();
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const analyses = new InMemoryPhotoAnalysisRepository();
    const albums = new InMemoryAlbumRepository();
    const exportJobs = new InMemoryExportJobRepository();
    const reviewSessions = new InMemoryReviewSessionRepository();

    const project = Project.create({ studioId: UniqueEntityId.create(), name: "Elena & Radu", type: "WEDDING" });
    await projects.save(project);
    const album = makeAlbum(project.id);
    await albums.save(album);
    const job = ExportJob.request({ albumId: album.id, printProfileId: "client-proof-150" });
    await exportJobs.save(job);

    const useCase = new DeleteProjectUseCase(
      projects,
      photos,
      storage,
      analyses,
      albums,
      exportJobs,
      storage,
      reviewSessions,
    );
    const result = await useCase.execute({ projectId: project.id.toString() });

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "CONFLICT");
    assert.ok(await projects.findById(project.id), "the project should not have been deleted");
    assert.ok(await albums.findById(album.id), "the album should not have been deleted");
    assert.ok(await exportJobs.findById(job.id), "the in-progress export should not have been touched");
  });

  it("reports 404 for a project that does not exist", async () => {
    const projects = new InMemoryProjectRepository();
    const photos = new InMemoryPhotoRepository();
    const storage = new InMemoryObjectStorage();
    const analyses = new InMemoryPhotoAnalysisRepository();
    const albums = new InMemoryAlbumRepository();
    const exportJobs = new InMemoryExportJobRepository();
    const reviewSessions = new InMemoryReviewSessionRepository();

    const useCase = new DeleteProjectUseCase(
      projects,
      photos,
      storage,
      analyses,
      albums,
      exportJobs,
      storage,
      reviewSessions,
    );
    const result = await useCase.execute({ projectId: UniqueEntityId.create().toString() });

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "NOT_FOUND");
  });
});
