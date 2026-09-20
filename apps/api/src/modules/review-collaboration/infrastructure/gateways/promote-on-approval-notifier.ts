import type { JobQueue } from "../../../../shared-kernel/job-queue";
import { QUEUES } from "../../../../shared-kernel/job-queue";
import type { ReviewNotifier } from "../../application/ports/album-gateway";

/**
 * When a client approves an album, the photos placed on it are the "selected"
 * set: queue their promotion to long-term storage. Best-effort by design — the
 * client's decision is already recorded and must not fail because Redis blinked;
 * the retention sweep promotes placed photos itself before it deletes anything,
 * so a lost trigger only delays the copy, never loses it.
 */
export class PromoteOnApprovalNotifier implements ReviewNotifier {
  constructor(
    private readonly next: ReviewNotifier,
    private readonly jobs: JobQueue,
    private readonly log: (message: string) => void = console.error,
  ) {}

  async clientDecided(params: Parameters<ReviewNotifier["clientDecided"]>[0]): Promise<void> {
    await this.next.clientDecided(params);
    if (params.decision !== "APPROVED") return;
    try {
      await this.jobs.enqueue(QUEUES.storage, "promote-selected", { albumId: params.albumId });
    } catch (error) {
      this.log(`[storage] could not queue promotion for album ${params.albumId}: ${String(error)}`);
    }
  }
}
