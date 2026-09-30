import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import type { JobQueue } from "../../application/ports/job-queue";

export class BullMqJobQueue implements JobQueue {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly connection: ConnectionOptions) {}

  private queueFor(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue<Payload extends Record<string, unknown>>(
    queueName: string,
    jobName: string,
    payload: Payload,
  ): Promise<void> {
    await this.queueFor(queueName).add(jobName, payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
  }

  /** Jobs per state for each named queue — the admin dashboard's backlog view. */
  async counts(names: readonly string[]) {
    return Promise.all(
      names.map(async (name) => {
        const counts = await this.queueFor(name).getJobCounts("waiting", "active", "delayed", "failed", "completed");
        return {
          name,
          waiting: counts["waiting"] ?? 0,
          active: counts["active"] ?? 0,
          delayed: counts["delayed"] ?? 0,
          failed: counts["failed"] ?? 0,
          completed: counts["completed"] ?? 0,
        };
      }),
    );
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
