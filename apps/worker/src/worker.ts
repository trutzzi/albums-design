import { Worker } from "bullmq";
import type { ConnectionOptions, Job } from "bullmq";
import { buildCompositionRoot } from "@albumflow/api";
import { QUEUES } from "@albumflow/api/shared-kernel/job-queue";

interface AnalyzePhotoJob {
  photoId: string;
  projectId: string;
  storageKey: string;
  useAi?: boolean;
}

interface RenderAlbumJob {
  exportJobId: string;
}

interface GenerateDerivativesJob {
  photoId: string;
}

/**
 * Every log line here is timestamped and every job logs both when it starts
 * and when it finishes — not just completion. Without both ends, "this line
 * appears right after startup" is indistinguishable from "this line appears
 * right after an 85-second stall nothing else got logged during," which is
 * exactly the ambiguity that made an earlier CI failure impossible to diagnose
 * from the log alone.
 */
function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function redisConnectionFrom(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}

async function main() {
  // The worker is a second entrypoint into the same application core, not a
  // parallel implementation — it shares every use case and adapter with the API.
  const root = buildCompositionRoot();
  const connection = redisConnectionFrom(root.env.REDIS_URL);

  const analysisWorker = new Worker(
    QUEUES.photoIntelligence,
    async (job: Job<AnalyzePhotoJob>) => {
      if (job.name !== "analyze-photo") return;
      const result = await root.analyzePhoto.execute(job.data);
      if (result.isFailure) throw new Error(result.getError().message);
      const analysis = result.getValue();
      log(
        `[analysis] ${analysis.photoId.toString()} scored ${analysis.score.overall} (${analysis.category}, ${analysis.orientation})`,
      );
    },
    { connection, concurrency: 4 },
  );
  analysisWorker.on("active", (job) => log(`[analysis] started ${job.data.photoId}`));

  // Display copies are what the editor draws, so they are generated eagerly and
  // with more parallelism than analysis: a photographer is usually looking at the
  // tray within seconds of the upload finishing.
  const derivativeWorker = new Worker(
    QUEUES.mediaIngestion,
    async (job: Job<GenerateDerivativesJob>) => {
      if (job.name !== "generate-derivatives") return;
      const result = await root.generateDerivatives.execute(job.data);
      if (result.isFailure) throw new Error(result.getError().message);
      const { photoId, written } = result.getValue();
      log(
        `[derivatives] ${photoId} — thumb ${Math.round(written.thumb / 1024)}KB, ` +
          `preview ${Math.round(written.preview / 1024)}KB`,
      );
    },
    { connection, concurrency: 4 },
  );
  derivativeWorker.on("active", (job) => log(`[derivatives] started ${job.data.photoId}`));

  const exportWorker = new Worker(
    QUEUES.albumExport,
    async (job: Job<RenderAlbumJob>) => {
      if (job.name !== "render-album") return;
      const result = await root.runExport.execute(job.data.exportJobId);
      if (result.isFailure) throw new Error(result.getError().message);
      const exportJob = result.getValue();
      if (exportJob.status === "FAILED") throw new Error(exportJob.failureReason ?? "Render failed");
      log(
        `[export] ${exportJob.id.toString()} ready — ${exportJob.pageCount} spreads, ${Math.round((exportJob.byteSize ?? 0) / 1024)}KB`,
      );
    },
    // PDF rendering is memory-hungry; one album at a time per worker process.
    { connection, concurrency: 1 },
  );
  exportWorker.on("active", (job) => log(`[export] started ${job.data.exportJobId}`));

  for (const worker of [derivativeWorker, analysisWorker, exportWorker]) {
    worker.on("failed", (job, error) => {
      log(`[${worker.name}] job ${job?.id} failed: ${error.message}`);
    });
  }

  const shutdown = async () => {
    await Promise.all([
      derivativeWorker.close(),
      analysisWorker.close(),
      exportWorker.close(),
    ]);
    await root.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  log(
    `Worker listening on: ${QUEUES.mediaIngestion}, ${QUEUES.photoIntelligence}, ${QUEUES.albumExport}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
