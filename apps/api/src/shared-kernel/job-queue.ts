export const QUEUES = {
  photoIntelligence: "photo-intelligence",
  albumExport: "album-export",
} as const;

export interface JobQueue {
  enqueue<Payload extends Record<string, unknown>>(
    queueName: string,
    jobName: string,
    payload: Payload,
  ): Promise<void>;
}
