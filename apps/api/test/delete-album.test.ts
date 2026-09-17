import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album, FULL_CROP } from "../src/modules/album-composition/domain/album";
import { ExportJob } from "../src/modules/export-print/domain/export-job";
import { ReviewSession } from "../src/modules/review-collaboration/domain/review-session";
import { DeleteAlbumUseCase } from "../src/modules/album-composition/application/use-cases/delete-album/delete-album.use-case";
import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryObjectStorage,
  InMemoryReviewSessionRepository,
} from "./support/in-memory";

function makeAlbum(): Album {
  return Album.create({
    projectId: UniqueEntityId.create(),
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

describe("deleting an album", () => {
  it("removes the album along with its exports and review sessions", async () => {
    const albums = new InMemoryAlbumRepository();
    const exportJobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const reviewSessions = new InMemoryReviewSessionRepository();

    const album = makeAlbum();
    await albums.save(album);

    const job = ExportJob.request({ albumId: album.id, printProfileId: "client-proof-150" });
    job.markReady({ storageKey: "exports/a.pdf", byteSize: 1024, pageCount: 1 });
    await exportJobs.save(job);
    storage.upload("exports/a.pdf", new Uint8Array([1, 2, 3]));

    const { session } = ReviewSession.open({ albumId: album.id, clientName: "Alex & Sam" });
    await reviewSessions.save(session);

    const useCase = new DeleteAlbumUseCase(albums, exportJobs, storage, reviewSessions);
    const result = await useCase.execute({ albumId: album.id.toString() });

    assert.ok(result.isSuccess);
    assert.equal(await albums.findById(album.id), undefined);
    assert.equal(await exportJobs.findById(job.id), undefined);
    assert.equal(storage.objects.has("exports/a.pdf"), false, "the stored PDF should be gone too");
    assert.equal(await reviewSessions.findById(session.id), undefined);
  });

  it("refuses while an export is still QUEUED, leaving everything in place", async () => {
    const albums = new InMemoryAlbumRepository();
    const exportJobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const reviewSessions = new InMemoryReviewSessionRepository();

    const album = makeAlbum();
    await albums.save(album);
    const job = ExportJob.request({ albumId: album.id, printProfileId: "client-proof-150" });
    await exportJobs.save(job);

    const useCase = new DeleteAlbumUseCase(albums, exportJobs, storage, reviewSessions);
    const result = await useCase.execute({ albumId: album.id.toString() });

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "CONFLICT");
    assert.ok(await albums.findById(album.id), "the album should not have been deleted");
    assert.ok(await exportJobs.findById(job.id), "the in-progress export should not have been touched");
  });

  it("reports 404 for an album that does not exist", async () => {
    const albums = new InMemoryAlbumRepository();
    const exportJobs = new InMemoryExportJobRepository();
    const storage = new InMemoryObjectStorage();
    const reviewSessions = new InMemoryReviewSessionRepository();

    const useCase = new DeleteAlbumUseCase(albums, exportJobs, storage, reviewSessions);
    const result = await useCase.execute({ albumId: UniqueEntityId.create().toString() });

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "NOT_FOUND");
  });
});
