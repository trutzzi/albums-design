export const QUEUES = {
  mediaIngestion: "media-ingestion",
  photoIntelligence: "photo-intelligence",
  albumExport: "album-export",
  storage: "storage",
  /** Housekeeping on a schedule: removing signups nobody confirmed. */
  maintenance: "maintenance",
} as const;

/** How many jobs a queue still holds (waiting, running or scheduled to retry). */
export interface QueueBacklog {
  pending(queueName: string): Promise<number>;
}

export interface JobQueue {
  enqueue<Payload extends Record<string, unknown>>(queueName: string, jobName: string, payload: Payload): Promise<void>;
}
