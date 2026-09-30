export const QUEUES = {
  mediaIngestion: "media-ingestion",
  photoIntelligence: "photo-intelligence",
  albumExport: "album-export",
  storage: "storage",
  /** Housekeeping on a schedule: removing signups nobody confirmed. */
  maintenance: "maintenance",
} as const;

export interface JobQueue {
  enqueue<Payload extends Record<string, unknown>>(
    queueName: string,
    jobName: string,
    payload: Payload,
  ): Promise<void>;
}
