import { Worker } from "bullmq";
import type { ConnectionOptions, Job } from "bullmq";
import { buildCompositionRoot } from "@albumflow/api";
import { QUEUES } from "@albumflow/api/shared-kernel/job-queue";

interface AnalyzePhotoJob {
  photoId: string;
  projectId: string;
  storageKey: string;
}

interface RenderAlbumJob {
  exportJobId: string;
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
      console.log(
        `[analysis] ${analysis.photoId.toString()} scored ${analysis.score.overall} (${analysis.category}, ${analysis.orientation})`,
      );
    },
    { connection, concurrency: 4 },
  );

  const exportWorker = new Worker(
    QUEUES.albumExport,
    async (job: Job<RenderAlbumJob>) => {
      if (job.name !== "render-album") return;
      const result = await root.runExport.execute(job.data.exportJobId);
      if (result.isFailure) throw new Error(result.getError().message);
      const exportJob = result.getValue();
      if (exportJob.status === "FAILED") throw new Error(exportJob.failureReason ?? "Render failed");
      console.log(
        `[export] ${exportJob.id.toString()} ready — ${exportJob.pageCount} spreads, ${Math.round((exportJob.byteSize ?? 0) / 1024)}KB`,
      );
    },
    // PDF rendering is memory-hungry; one album at a time per worker process.
    { connection, concurrency: 1 },
  );

  for (const worker of [analysisWorker, exportWorker]) {
    worker.on("failed", (job, error) => {
      console.error(`[${worker.name}] job ${job?.id} failed:`, error.message);
    });
  }

  const shutdown = async () => {
    await Promise.all([analysisWorker.close(), exportWorker.close()]);
    await root.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log(`Worker listening on: ${QUEUES.photoIntelligence}, ${QUEUES.albumExport}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
