import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { Project } from "../src/modules/media-ingestion/domain/project";
import { ListStudioProjectsUseCase } from "../src/modules/media-ingestion/application/use-cases/list-studio-projects/list-studio-projects.use-case";
import { MediaIngestionPhotoLifecycle } from "../src/modules/photo-intelligence/infrastructure/gateways/photo-lifecycle-gateway";
import { RecordAnalysisFailureUseCase } from "../src/modules/photo-intelligence/application/use-cases/record-analysis-failure/record-analysis-failure.use-case";
import { RetryFailedAnalysesUseCase } from "../src/modules/media-ingestion/application/use-cases/retry-failed-analyses/retry-failed-analyses.use-case";
import {
  InMemoryAlbumRepository,
  InMemoryJobQueue,
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

  const jobs = new InMemoryJobQueue();
  return {
    photos,
    jobs,
    projectId: project.id.toString(),
    queuedPhoto,
    retry: new RetryFailedAnalysesUseCase(photos, jobs),
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

describe("retrying analysis for a shoot's failed photos", () => {
  it("queues each failed photo again, with the built-in analysis", async () => {
    const w = await world();
    const failed = await w.queuedPhoto("001.jpg");
    await w.recordFailure.execute({ photoId: failed.id.toString() });
    const analysed = await w.queuedPhoto("002.jpg");
    await w.lifecycle.markAnalysed(analysed.id.toString());

    const result = await w.retry.execute({ projectId: w.projectId });

    assert.deepEqual(result.getValue(), { queued: 1 });
    assert.equal((await w.photos.findById(failed.id))?.status, "ANALYSIS_QUEUED");
    assert.equal((await w.photos.findById(analysed.id))?.status, "ANALYSED", "an analysed photo is not redone");
    assert.deepEqual(
      w.jobs.drain("photo-intelligence").map((job) => [job.name, job.payload.photoId, job.payload.useAi]),
      [["analyze-photo", failed.id.toString(), false]],
    );
    assert.equal((await w.shoots())[0]?.processingCount, 1, "the card shows progress again");
  });

  it("queues a photo once, however often retry is pressed", async () => {
    const w = await world();
    const failed = await w.queuedPhoto("001.jpg");
    await w.recordFailure.execute({ photoId: failed.id.toString() });

    await w.retry.execute({ projectId: w.projectId });
    const second = await w.retry.execute({ projectId: w.projectId });

    assert.deepEqual(second.getValue(), { queued: 0 });
    assert.equal(w.jobs.drain("photo-intelligence").length, 1);
  });

  it("puts the photo back to failed when the job cannot be queued, so it is never left waiting on nothing", async () => {
    const w = await world();
    const failed = await w.queuedPhoto("001.jpg");
    await w.recordFailure.execute({ photoId: failed.id.toString() });
    const errors: string[] = [];
    const brokenQueue = {
      enqueue: async () => {
        throw new Error("redis down");
      },
    };
    const logger = { ...console, error: (message: string) => void errors.push(message), child: () => logger };
    const retry = new RetryFailedAnalysesUseCase(w.photos, brokenQueue, logger as never);

    const result = await retry.execute({ projectId: w.projectId });

    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "RETRY_NOT_QUEUED");
    assert.equal((await w.photos.findById(failed.id))?.status, "FAILED");
    assert.equal((await w.shoots())[0]?.processingCount, 0, "the card does not start waiting");
    assert.equal(errors.length, 1, "the outage is logged at error level");
  });

  it("only ever moves a failed photo back to the queue", () => {
    const photo = Photo.requestUpload({
      projectId: UniqueEntityId.create(),
      studioId: UniqueEntityId.create(),
      fileName: "001.jpg",
      mimeType: "image/jpeg",
      byteSize: 1000,
    });
    photo.markUploaded({ byteSize: 1000 });
    assert.throws(() => photo.retryAnalysis());
    photo.markFailed();
    photo.retryAnalysis();
    assert.equal(photo.status, "ANALYSIS_QUEUED");
  });
});
