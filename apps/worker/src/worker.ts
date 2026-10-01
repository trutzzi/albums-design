import { performance } from "node:perf_hooks";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, Job } from "bullmq";
import { buildCompositionRoot, type CompositionRoot } from "@albumflow/api";
import { QUEUES } from "@albumflow/api/shared-kernel/job-queue";
import { flushErrorReports, installProcessGuards, startErrorMonitoring } from "@albumflow/api/monitoring";
import type { LogContext, Logger } from "@albumflow/api/logger";

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

interface PromoteSelectedJob {
  albumId: string;
}

interface PromotePickedJob {
  projectId: string;
}

interface StoreOriginalJob {
  photoId: string;
}

/** Runs one kind of job; what it returns is logged with the job's completion. */
type JobHandler = (job: Job) => Promise<LogContext | void>;

/** Types a handler by its payload, so each one reads its own job data without casts at the call site. */
function handle<T>(run: (data: T) => Promise<LogContext | void>): JobHandler {
  return (job) => run(job.data as T);
}

/** A use case that failed is a failed job: BullMQ retries it and, on the last attempt, it is reported. */
function valueOf<T>(result: { isFailure: boolean; getError(): { message: string }; getValue(): T }): T {
  if (result.isFailure) throw new Error(result.getError().message);
  return result.getValue();
}

/**
 * Every queue is served the same way: its job names map to handlers, and the dispatch
 * logs when each job starts and when it finishes — not just completion. Without both
 * ends, "this line appears right after startup" is indistinguishable from "this line
 * appears right after an 85-second stall nothing else got logged during", which is
 * exactly the ambiguity that made an earlier CI failure impossible to diagnose.
 */
function serveQueue(
  queue: string,
  handlers: Record<string, JobHandler>,
  options: { connection: ConnectionOptions; concurrency: number; logger: Logger },
): Worker {
  const log = options.logger.child({ queue });
  const worker = new Worker(
    queue,
    async (job: Job) => {
      const run = handlers[job.name];
      if (!run) {
        log.warn("no handler for job; skipped", { job: job.name, jobId: job.id });
        return;
      }
      const started = performance.now();
      const summary = await run(job);
      log.info("job completed", {
        job: job.name,
        jobId: job.id,
        durationMs: Math.round(performance.now() - started),
        ...summary,
      });
    },
    { connection: options.connection, concurrency: options.concurrency },
  );
  worker.on("active", (job) => log.info("job started", { job: job.name, jobId: job.id }));
  worker.on("failed", (job, error) => {
    const context = { job: job?.name, jobId: job?.id, attempt: job?.attemptsMade, err: error };
    // Only the last attempt is an incident: a retry that later succeeds is noise.
    if (!job || job.attemptsMade >= (job.opts.attempts ?? 1)) log.error("job failed", context);
    else log.warn("job failed; will retry", context);
  });
  // Without a listener, a Redis connection error on a worker is an unhandled 'error' event.
  worker.on("error", (error) => log.error("worker error", { err: error }));
  return worker;
}

function analysisJobs(root: CompositionRoot): Record<string, JobHandler> {
  return {
    "analyze-photo": handle<AnalyzePhotoJob>(async (data) => {
      const analysis = valueOf(await root.analyzePhoto.execute(data));
      return {
        photoId: analysis.photoId.toString(),
        score: analysis.score.overall,
        category: analysis.category,
        orientation: analysis.orientation,
      };
    }),
  };
}

function derivativeJobs(root: CompositionRoot): Record<string, JobHandler> {
  return {
    "generate-derivatives": handle<GenerateDerivativesJob>(async (data) => {
      const { photoId, written } = valueOf(await root.generateDerivatives.execute(data));
      return { photoId, thumbKb: Math.round(written.thumb / 1024), previewKb: Math.round(written.preview / 1024) };
    }),
  };
}

function exportJobs(root: CompositionRoot): Record<string, JobHandler> {
  return {
    "render-album": handle<RenderAlbumJob>(async (data) => {
      const exportJob = valueOf(await root.runExport.execute(data.exportJobId));
      if (exportJob.status === "FAILED") throw new Error(exportJob.failureReason ?? "Render failed");
      return {
        exportJobId: exportJob.id.toString(),
        spreads: exportJob.pageCount,
        sizeKb: Math.round((exportJob.byteSize ?? 0) / 1024),
      };
    }),
  };
}

/** Only the jobs whose use case exists under this configuration are registered. */
function storageJobs(root: CompositionRoot): Record<string, JobHandler> {
  const jobs: Record<string, JobHandler> = {};
  const { storeOriginal, storePending, promoteSelected, purgeExpiredOriginals, offsiteBackups } = root;
  if (storeOriginal) {
    // The fast path: one photo's original, queued the moment its upload was confirmed.
    jobs["store-original"] = handle<StoreOriginalJob>(async (data) => ({
      photoId: data.photoId,
      outcome: valueOf(await storeOriginal.execute({ photoId: data.photoId })),
    }));
  }
  if (storePending) {
    // The safety net and backfill: everything not yet on long-term storage, oldest first.
    jobs["store-pending"] = handle(async () => {
      const summary = await storePending.execute();
      // The next run continues where a time-limited one stopped.
      return { ...summary };
    });
  }
  if (promoteSelected) {
    jobs["promote-picked"] = handle<PromotePickedJob>(async (data) => ({
      projectId: data.projectId,
      ...valueOf(await promoteSelected.executePicked({ projectId: data.projectId })),
    }));
    jobs["promote-selected"] = handle<PromoteSelectedJob>(async (data) => ({
      albumId: data.albumId,
      ...valueOf(await promoteSelected.execute({ albumId: data.albumId })),
    }));
  }
  if (offsiteBackups) {
    jobs["offsite-backup"] = handle(async () => {
      const summary = await offsiteBackups.run();
      return { uploaded: summary.uploaded, alreadyThere: summary.alreadyThere, pruned: summary.pruned };
    });
  }
  if (purgeExpiredOriginals) {
    jobs["purge-expired"] = handle(async () => ({ ...(await purgeExpiredOriginals.execute()) }));
  }
  return jobs;
}

function maintenanceJobs(root: CompositionRoot): Record<string, JobHandler> {
  return {
    // Unconfirmed signups older than 48h; ones with shoots or teammates are kept.
    "purge-unconfirmed": handle(async () => ({ ...(await root.purgeUnconfirmedSignups.execute()) })),
    // Admin error log occurrences past ERROR_LOG_RETENTION_DAYS; the grouped issues stay.
    "purge-error-log": handle(async () => ({ ...(await root.errorInbox.purgeExpired()) })),
  };
}

async function main() {
  // The worker is a second entrypoint into the same application core, not a
  // parallel implementation — it shares every use case and adapter with the API.
  const root = buildCompositionRoot(undefined, { service: "worker" });
  startErrorMonitoring({ dsn: root.env.SENTRY_DSN, environment: root.env.NODE_ENV, service: "worker" });
  installProcessGuards(root.logger);
  const logger = root.logger;
  const connection = root.redisConnection;
  const serve = (queue: string, handlers: Record<string, JobHandler>, concurrency: number) =>
    serveQueue(queue, handlers, { connection, concurrency, logger });

  // Display copies are what the editor draws, so they are generated eagerly and with
  // as much parallelism as analysis: a photographer is usually looking at the tray
  // within seconds of the upload finishing.
  const derivativeWorker = serve(QUEUES.mediaIngestion, derivativeJobs(root), root.env.WORKER_CONCURRENCY);
  const analysisWorker = serve(QUEUES.photoIntelligence, analysisJobs(root), root.env.WORKER_CONCURRENCY);
  // PDF rendering is memory-hungry; one album at a time per worker process.
  const exportWorker = serve(QUEUES.albumExport, exportJobs(root), 1);

  // Long-term tier: promote chosen originals when an album is approved, and
  // expire staged originals after delivery. Only exists when a provider is
  // configured — with STORAGE_PROVIDER=none there is no second copy, so a
  // purge would be data loss and neither job is ever registered.
  // Copies move whole originals through memory, so keep this small: two at once lets a
  // long backfill sweep run beside the individual copies without starving them.
  const storageWorker =
    root.promoteSelected && root.purgeExpiredOriginals ? serve(QUEUES.storage, storageJobs(root), 2) : undefined;

  const storageQueue = storageWorker ? new Queue(QUEUES.storage, { connection }) : undefined;
  // Idempotent by scheduler id: restarting the worker does not stack schedules.
  await storageQueue?.upsertJobScheduler(
    "purge-expired-originals",
    { pattern: "0 3 * * *" },
    { name: "purge-expired", data: {} },
  );

  // The nightly database dump lands around 03:00 UTC on a fresh deploy's schedule; copying at
  // 04:00, and once at startup, gets every dump off the server within a day of being written.
  if (storageQueue && root.offsiteBackups) {
    await storageQueue.upsertJobScheduler(
      "offsite-database-backup",
      { pattern: "0 4 * * *" },
      { name: "offsite-backup", data: {} },
    );
    await storageQueue.add("offsite-backup", {}, { removeOnComplete: 20, removeOnFail: 20 });
  }

  // Every original goes to long-term storage (LONG_TERM_ORIGINALS=all): a sweep every 5
  // minutes stores whatever is not there yet — the backfill for photos uploaded earlier and
  // the retry for any copy that failed — and one runs right away at startup.
  if (storageQueue && root.storePending) {
    await storageQueue.upsertJobScheduler(
      "store-pending-originals",
      { pattern: "*/5 * * * *" },
      { name: "store-pending", data: {} },
    );
    await storageQueue.add("store-pending", {}, { removeOnComplete: 50, removeOnFail: 50 });
  }

  const maintenanceWorker = serve(QUEUES.maintenance, maintenanceJobs(root), 1);
  const maintenanceQueue = new Queue(QUEUES.maintenance, { connection });
  await maintenanceQueue.upsertJobScheduler(
    "purge-unconfirmed-signups",
    { pattern: "20 * * * *" },
    { name: "purge-unconfirmed", data: {} },
  );
  await maintenanceQueue.add("purge-unconfirmed", {}, { removeOnComplete: 20, removeOnFail: 20 });
  await maintenanceQueue.upsertJobScheduler(
    "purge-error-log",
    { pattern: "40 4 * * *" },
    { name: "purge-error-log", data: {} },
  );

  const workers = [
    derivativeWorker,
    analysisWorker,
    exportWorker,
    maintenanceWorker,
    ...(storageWorker ? [storageWorker] : []),
  ];

  const shutdown = async (signal: string) => {
    logger.info("shutting down", { signal });
    try {
      await Promise.all([...workers.map((worker) => worker.close()), storageQueue?.close(), maintenanceQueue.close()]);
      await root.shutdown();
    } catch (error) {
      logger.error("shutdown did not complete cleanly", { err: error });
    }
    await flushErrorReports();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  logger.info("worker listening", {
    queues: workers.map((worker) => worker.name),
    longTermStorage: root.permanentStorage?.id ?? null,
    offsiteBackups: Boolean(root.offsiteBackups),
  });
}

main().catch(async (error) => {
  // The logger may not exist yet (an invalid environment fails before it is built).
  console.error(error);
  await flushErrorReports();
  process.exit(1);
});
