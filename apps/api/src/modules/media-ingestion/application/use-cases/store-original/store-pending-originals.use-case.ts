import type { PhotoRepository } from "../../../domain/photo-repository";
import type { StoreOriginalUseCase } from "./store-original.use-case";

export interface StorePendingSummary {
  stored: number;
  alreadyStored: number;
  skipped: number;
  failed: number;
  /** True when the time budget ran out before every waiting photo was tried. */
  stoppedEarly: boolean;
}

/**
 * The safety net behind "every photo goes to DigiStorage". The fast path stores a
 * photo the moment it is uploaded; this sweeps up everything that path missed —
 * photos uploaded before long-term storage was switched on, a copy that failed while
 * DigiStorage was unreachable, a job lost with a restarted worker. Oldest first.
 *
 * Runs for a bounded time, so a backlog of thousands of photos is worked through
 * over several runs instead of one endless job. A photo that fails is not retried
 * within the same run (which would spin on it forever); the next run tries again.
 */
export class StorePendingOriginalsUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly store: StoreOriginalUseCase,
    private readonly now: () => number = Date.now,
    private readonly log: (message: string) => void = console.error,
  ) {}

  async execute(options: { budgetMs?: number; batchSize?: number } = {}): Promise<StorePendingSummary> {
    const budgetMs = options.budgetMs ?? 4 * 60 * 1000;
    const batchSize = options.batchSize ?? 25;
    const deadline = this.now() + budgetMs;
    const summary: StorePendingSummary = { stored: 0, alreadyStored: 0, skipped: 0, failed: 0, stoppedEarly: false };
    const failedThisRun = new Set<string>();

    while (true) {
      // Asks for enough extra to look past the photos already known to fail in this run.
      const waiting = (await this.photos.findAwaitingLongTermStorage(batchSize + failedThisRun.size)).filter(
        (photo) => !failedThisRun.has(photo.id.toString()),
      );
      if (waiting.length === 0) return summary;

      for (const photo of waiting.slice(0, batchSize)) {
        if (this.now() >= deadline) {
          summary.stoppedEarly = true;
          return summary;
        }
        const result = await this.store.execute({ photoId: photo.id.toString() });
        if (result.isFailure) {
          failedThisRun.add(photo.id.toString());
          summary.failed++;
          this.log(`[storage] ${result.getError().message}`);
        } else if (result.getValue() === "stored") summary.stored++;
        else if (result.getValue() === "already-stored") summary.alreadyStored++;
        else {
          // "skipped" photos are not eligible, yet the query returned them; count them out so the loop ends.
          failedThisRun.add(photo.id.toString());
          summary.skipped++;
        }
      }
    }
  }
}
