import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { RequeueUnfinishedPhotosUseCase } from "../src/modules/media-ingestion/application/use-cases/requeue-unfinished/requeue-unfinished.use-case";
import { QUEUES, type QueueBacklog } from "../src/shared-kernel/job-queue";
import { InMemoryJobQueue, InMemoryPhotoRepository } from "./support/in-memory";
import { RecordingLogger } from "./support/recording-logger";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-25T12:00:00Z");

class Backlog implements QueueBacklog {
  counts: Record<string, number> = {};
  async pending(name: string) {
    return this.counts[name] ?? 0;
  }
}

function world() {
  const photos = new InMemoryPhotoRepository();
  const jobs = new InMemoryJobQueue();
  const backlog = new Backlog();
  const logger = new RecordingLogger();
  const requeue = new RequeueUnfinishedPhotosUseCase(photos, jobs, backlog, logger, () => NOW);

  async function add(
    name: string,
    state: {
      status?: "UPLOADED" | "ANALYSIS_QUEUED" | "ANALYSED" | "FAILED" | "PENDING_UPLOAD";
      derived?: boolean;
      ageHours?: number;
      purged?: boolean;
    } = {},
  ) {
    const photo = Photo.requestUpload({
      projectId: UniqueEntityId.create(),
      studioId: UniqueEntityId.create(),
      fileName: name,
      mimeType: "image/jpeg",
      byteSize: 1000,
    });
    // Uploaded `ageHours` before the clock the use case reads.
    (photo as unknown as { props: { createdAt: Date } }).props.createdAt = new Date(
      NOW.getTime() - (state.ageHours ?? 2) * HOUR,
    );
    const status = state.status ?? "ANALYSIS_QUEUED";
    if (status !== "PENDING_UPLOAD") photo.markUploaded({ byteSize: 1000 });
    if (status === "ANALYSIS_QUEUED" || status === "ANALYSED" || status === "FAILED") photo.markAnalysisQueued();
    if (status === "ANALYSED") photo.markAnalysed();
    if (status === "FAILED") photo.markFailed();
    if (state.derived) photo.markDerivativesReady({ permanent: true });
    if (state.purged) photo.markStagedOriginalPurged(NOW);
    await photos.save(photo);
    return photo;
  }
  const queued = (queue: string) => jobs.drain(queue).map((job) => job.payload["photoId"]);
  return { photos, jobs, backlog, logger, requeue, add, queued };
}

describe("RequeueUnfinishedPhotosUseCase: photos stuck in processing", () => {
  it("queues the jobs each stuck photo still needs, and nothing more", async () => {
    const w = world();
    const both = await w.add("nothing-done.jpg");
    const analysisOnly = await w.add("has-previews.jpg", { derived: true });
    const previewsOnly = await w.add("analysed-no-previews.jpg", { status: "ANALYSED" });

    const summary = await w.requeue.execute();

    assert.deepEqual(summary, { requeued: 3, queuesBusy: false, givenUp: 0 });
    assert.deepEqual(
      new Set(w.queued(QUEUES.mediaIngestion)),
      new Set([both.id.toString(), previewsOnly.id.toString()]),
    );
    assert.deepEqual(
      new Set(w.queued(QUEUES.photoIntelligence)),
      new Set([both.id.toString(), analysisOnly.id.toString()]),
    );
    const analysis = w.jobs
      .drain(QUEUES.photoIntelligence)
      .find((job) => job.payload["photoId"] === both.id.toString());
    assert.equal(analysis?.payload["storageKey"], both.storageKey.toString());
    assert.equal(w.logger.problems.length, 1);
    assert.equal(w.logger.problems[0]?.level, "warn");
  });

  it("does nothing while the queues still hold jobs: a long upload backlog is not a lost one", async () => {
    const w = world();
    await w.add("waiting.jpg", { ageHours: 5 });
    w.backlog.counts[QUEUES.photoIntelligence] = 1200;

    assert.deepEqual(await w.requeue.execute(), { requeued: 0, queuesBusy: true, givenUp: 0 });
    assert.equal(w.jobs.jobs.length, 0);
  });

  it("leaves alone recent uploads, finished photos, failed ones, unfinished uploads and purged originals", async () => {
    const w = world();
    await w.add("just-uploaded.jpg", { ageHours: 0.1 });
    await w.add("done.jpg", { status: "ANALYSED", derived: true });
    await w.add("failed.jpg", { status: "FAILED" });
    await w.add("never-arrived.jpg", { status: "PENDING_UPLOAD" });
    await w.add("purged.jpg", { purged: true });

    assert.equal((await w.requeue.execute()).requeued, 0);
    assert.equal(w.jobs.jobs.length, 0);
  });

  it("gives up on a photo after three tries: marks it failed so the photographer sees it, says so once", async () => {
    const w = world();
    const broken = await w.add("broken.jpg");
    for (let run = 0; run < 3; run++) assert.equal((await w.requeue.execute()).requeued, 1);

    const fourth = await w.requeue.execute();
    const fifth = await w.requeue.execute();

    assert.deepEqual([fourth.requeued, fourth.givenUp, fifth.requeued, fifth.givenUp], [0, 1, 0, 0]);
    // Failed is stored, so a restart does not start the cycle again.
    assert.equal((await w.photos.findById(broken.id))?.status, "FAILED");
    const errors = w.logger.entries.filter((entry) => entry.level === "error");
    assert.equal(errors.length, 1);
    assert.deepEqual(errors[0]?.context, { count: 1, photos: ["broken.jpg"] });
  });

  it("never lets given-up photos crowd newer stuck ones out of a run", async () => {
    const w = world();
    await w.add("analysed-but-no-previews.jpg", { status: "ANALYSED", ageHours: 10 });
    for (let run = 0; run < 4; run++) await w.requeue.execute({ limit: 1 });
    const fresh = await w.add("fresh-stuck.jpg", { ageHours: 1 });
    w.jobs.jobs.length = 0;

    const summary = await w.requeue.execute({ limit: 1 });

    assert.equal(summary.requeued, 1);
    assert.deepEqual(w.queued(QUEUES.mediaIngestion), [fresh.id.toString()]);
  });

  it("says how many were analysed with the built-in analysis", async () => {
    const w = world();
    await w.add("a.jpg");
    await w.add("b.jpg", { status: "ANALYSED" });
    await w.requeue.execute();
    assert.deepEqual(w.logger.problems[0]?.context, { count: 2, analysedWithBuiltIn: 1 });
  });
});
