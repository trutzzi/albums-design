import type { JobQueue } from "../../../../shared-kernel/job-queue";
import { QUEUES } from "../../../../shared-kernel/job-queue";
import type { PickNotifier } from "../../application/ports/pick-gateway";

/**
 * A client's submitted picks are the strongest "selected" signal there is, so
 * queue their full-resolution originals for long-term storage. Best-effort by
 * design, exactly like promotion on album approval: the submission is already
 * recorded and must not fail because Redis blinked, and the retention sweep
 * promotes picked photos itself before it deletes anything.
 */
export class PromoteOnPickNotifier implements PickNotifier {
  constructor(
    private readonly next: PickNotifier,
    private readonly jobs: JobQueue,
    private readonly log: (message: string) => void = console.error,
  ) {}

  async picksSubmitted(params: Parameters<PickNotifier["picksSubmitted"]>[0]): Promise<void> {
    await this.next.picksSubmitted(params);
    try {
      await this.jobs.enqueue(QUEUES.storage, "promote-picked", { projectId: params.projectId });
    } catch (error) {
      this.log(`[storage] could not queue promotion for picks of project ${params.projectId}: ${String(error)}`);
    }
  }
}
