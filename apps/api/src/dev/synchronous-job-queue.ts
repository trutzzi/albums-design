import type { JobQueue } from "../shared-kernel/job-queue";

type Handler = (jobName: string, payload: Record<string, unknown>) => Promise<void>;

/**
 * Replaces BullMQ in demo mode by running the job inline. A job that would sit on a
 * Redis queue instead completes before the HTTP request returns — slower per request,
 * but it removes Redis and the worker process from the setup entirely.
 */
export class SynchronousJobQueue implements JobQueue {
  private readonly handlers = new Map<string, Handler>();

  on(queueName: string, handler: Handler): void {
    this.handlers.set(queueName, handler);
  }

  async enqueue<Payload extends Record<string, unknown>>(
    queueName: string,
    jobName: string,
    payload: Payload,
  ): Promise<void> {
    const handler = this.handlers.get(queueName);
    if (!handler) {
      console.warn(`[queue] no handler registered for ${queueName}; dropping ${jobName}`);
      return;
    }
    try {
      await handler(jobName, payload);
    } catch (error) {
      // A failed background job must not fail the request that triggered it.
      console.error(`[queue] ${queueName}/${jobName} failed:`, error);
    }
  }
}
