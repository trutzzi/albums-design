import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { StorageProvider } from "#src/shared-kernel/storage-provider";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";
import type { ObjectStorageWithBody } from "../../ports/object-storage";

export interface ReleaseSummary {
  /** Staged originals deleted because long-term storage holds them at full size. */
  released: number;
  freedBytes: number;
  /** Marked stored, yet not on long-term storage at full size: kept, and queued to be copied again. */
  missing: number;
  /** Could not be checked or deleted this run (long-term storage unreachable, say); the next run retries. */
  failed: number;
  /** True when the time budget ran out, or long-term storage kept failing, before every candidate was handled. */
  stoppedEarly: boolean;
  /** True when another run was already going, so this one did nothing. */
  alreadyRunning?: boolean;
}

/** Errors in a row after which long-term storage is taken to be down and the run stops. */
const FAILURES_BEFORE_GIVING_UP = 5;

/**
 * With every original on long-term storage, the server copy is only a staging step: the
 * browser can upload to MinIO, not to DigiStorage. Once a photo's original has been on
 * long-term storage for `keepDays`, this deletes the staged copy. Exports and downloads then
 * read the original from long-term storage; the gallery and editor use the display copies.
 *
 * The "stored" mark alone is not trusted: each original is checked on long-term storage at
 * its exact size right before its staged copy is deleted. One that is not there keeps its
 * staged copy and loses the mark, so the store sweep copies it again.
 *
 * Only analysed photos with display copies qualify: analysis and making the display copies
 * read the staged original.
 */
export class ReleaseStagedOriginalsUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly staging: ObjectStorageWithBody,
    private readonly permanent: StorageProvider,
    private readonly keepDays: number,
    private readonly logger: Logger = consoleLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private running = false;

  async execute(options: { budgetMs?: number; batchSize?: number } = {}): Promise<ReleaseSummary> {
    if (this.running) {
      return { released: 0, freedBytes: 0, missing: 0, failed: 0, stoppedEarly: false, alreadyRunning: true };
    }
    this.running = true;
    try {
      return await this.sweep(options);
    } finally {
      this.running = false;
    }
  }

  private async sweep(options: { budgetMs?: number; batchSize?: number }): Promise<ReleaseSummary> {
    const started = this.now().getTime();
    const deadline = started + (options.budgetMs ?? 10 * 60 * 1000);
    const batchSize = options.batchSize ?? 200;
    const cutoff = new Date(started - this.keepDays * 24 * 60 * 60 * 1000);
    const summary: ReleaseSummary = { released: 0, freedBytes: 0, missing: 0, failed: 0, stoppedEarly: false };
    const failedThisRun = new Set<string>();
    const missingNames: string[] = [];
    let failuresInARow = 0;

    try {
      while (true) {
        // Asks for enough extra to look past the photos that already failed in this run.
        const batch = (
          await this.photos.findStagedOriginalsStoredBefore(cutoff, batchSize + failedThisRun.size)
        ).filter((photo) => !failedThisRun.has(photo.id.toString()));
        if (batch.length === 0) return summary;

        for (const photo of batch.slice(0, batchSize)) {
          if (this.now().getTime() >= deadline || failuresInARow >= FAILURES_BEFORE_GIVING_UP) {
            summary.stoppedEarly = true;
            return summary;
          }
          const key = photo.storageKey.toString();
          try {
            const stored = await this.permanent.head(key);
            if (!stored || stored.size !== photo.byteSize) {
              // Never delete what may be the only copy. Unmarking it drops it from this query and
              // hands it back to the store sweep, which copies it from staging again.
              await this.photos.markFullResMissing(photo.id);
              summary.missing++;
              missingNames.push(photo.fileName);
            } else {
              await this.staging.delete(key);
              await this.photos.markStagedOriginalPurged(photo.id, this.now());
              summary.released++;
              summary.freedBytes += photo.byteSize;
            }
            failuresInARow = 0;
          } catch (error) {
            failedThisRun.add(photo.id.toString());
            summary.failed++;
            failuresInARow++;
            this.logger.warn("could not release a staged original", {
              photoId: photo.id.toString(),
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    } finally {
      if (summary.missing > 0) {
        this.logger.error("originals marked as stored long-term were not there; kept on the server and copying again", {
          count: summary.missing,
          photos: missingNames.slice(0, 20),
        });
      }
    }
  }
}
