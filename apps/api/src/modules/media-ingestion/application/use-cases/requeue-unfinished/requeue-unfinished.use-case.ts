import { QUEUES, type QueueBacklog } from "#src/shared-kernel/job-queue";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { JobQueue } from "../../ports/job-queue";

export interface RequeueSummary {
  /** Photos whose lost jobs were queued again. */
  requeued: number;
  /** True when the queues still held jobs, so nothing was judged lost. */
  queuesBusy: boolean;
  /** Photos re-queued too often, given up on in this run: marked failed and reported once. */
  givenUp: number;
}

/** Re-queues of the same photo in one worker's lifetime before it is reported instead. */
const MAX_REQUEUES = 3;

/**
 * The safety net for processing jobs that vanished: a Redis restart, a worker killed with
 * jobs in hand. Such a photo shows "processing" forever, because nothing will ever finish it.
 *
 * A photo is only judged lost when the processing queues are empty. A long upload backlog
 * keeps them busy, and every photo in it still has its job waiting. Then each unfinished
 * photo uploaded more than `graceMs` ago gets the jobs it still needs: display copies,
 * analysis, or both. Both jobs are safe to run twice.
 */
export class RequeueUnfinishedPhotosUseCase {
  private readonly requeues = new Map<string, number>();
  private readonly givenUp = new Set<string>();

  constructor(
    private readonly photos: PhotoRepository,
    private readonly jobs: JobQueue,
    private readonly backlog: QueueBacklog,
    private readonly logger: Logger = consoleLogger,
    private readonly now: () => Date = () => new Date(),
    private readonly graceMs = 30 * 60 * 1000,
  ) {}

  async execute(options: { limit?: number } = {}): Promise<RequeueSummary> {
    const pending =
      (await this.backlog.pending(QUEUES.mediaIngestion)) + (await this.backlog.pending(QUEUES.photoIntelligence));
    if (pending > 0) return { requeued: 0, queuesBusy: true, givenUp: 0 };

    const cutoff = new Date(this.now().getTime() - this.graceMs);
    const limit = options.limit ?? 1000;
    // Asks for enough extra to look past photos already given up on, so they never crowd out newer ones.
    const unfinished = (await this.photos.findUnfinishedProcessing(cutoff, limit + this.givenUp.size))
      .filter((photo) => !this.givenUp.has(photo.id.toString()))
      .slice(0, limit);
    const summary: RequeueSummary = { requeued: 0, queuesBusy: false, givenUp: 0 };
    const givenUpNow: string[] = [];
    let builtInAnalysis = 0;

    for (const photo of unfinished) {
      const id = photo.id.toString();
      const needsAnalysis = photo.status === "UPLOADED" || photo.status === "ANALYSIS_QUEUED";
      const tries = this.requeues.get(id) ?? 0;
      if (tries >= MAX_REQUEUES) {
        // Marked failed, the photo shows as such with the shoot's "retry" button, and the mark
        // survives a restart, where a count kept here would not. A photo missing only its
        // display copies has no failed state of its own; it is left out for this process's life.
        if (needsAnalysis) await this.photos.updateStatusIf(photo.id, ["UPLOADED", "ANALYSIS_QUEUED"], "FAILED");
        this.givenUp.add(id);
        givenUpNow.push(photo.fileName);
        summary.givenUp++;
        continue;
      }
      this.requeues.set(id, tries + 1);
      if (!photo.hasDerivatives) {
        await this.jobs.enqueue(QUEUES.mediaIngestion, "generate-derivatives", { photoId: id });
      }
      if (needsAnalysis) {
        // Whether AI was chosen at upload is not stored; the built-in analysis always works.
        await this.jobs.enqueue(QUEUES.photoIntelligence, "analyze-photo", {
          photoId: id,
          projectId: photo.projectId.toString(),
          storageKey: photo.storageKey.toString(),
          mimeType: photo.mimeType,
          useAi: false,
        });
        builtInAnalysis++;
      }
      summary.requeued++;
    }

    if (summary.requeued > 0) {
      this.logger.warn("photos had lost their processing jobs; queued them again", {
        count: summary.requeued,
        // Said plainly, since a photo uploaded with AI analysis gets the built-in one this time.
        analysedWithBuiltIn: builtInAnalysis,
      });
    }
    if (givenUpNow.length > 0) {
      // Queued several times and still not finished: something about these photos needs a look.
      this.logger.error("photos never finish processing, even after being queued again; marked failed", {
        count: givenUpNow.length,
        photos: givenUpNow.slice(0, 20),
      });
    }
    return summary;
  }
}
