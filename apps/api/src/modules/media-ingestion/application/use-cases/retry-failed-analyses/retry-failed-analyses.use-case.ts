import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import type { ApplicationError } from "#src/shared-kernel/errors";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { JobQueue } from "../../ports/job-queue";

const PHOTO_INTELLIGENCE_QUEUE = "photo-intelligence";

/**
 * Queues every photo of a shoot whose analysis gave up for another try — the manual way
 * back from the dead letter. Retries use the built-in analysis (whether AI was chosen at
 * upload is not stored, and a failing AI service is the usual reason a photo failed).
 */
export class RetryFailedAnalysesUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly jobs: JobQueue,
  ) {}

  async execute(command: { projectId: string }): Promise<Result<{ queued: number }, ApplicationError>> {
    const photos = await this.photos.findByProjectId(UniqueEntityId.create(command.projectId));
    let queued = 0;
    for (const photo of photos) {
      if (photo.status !== "FAILED") continue;
      photo.retryAnalysis();
      // Two clicks, or two tabs, must not queue the same photo twice.
      if (!(await this.photos.updateStatusIf(photo.id, ["FAILED"], photo.status))) continue;
      await this.jobs.enqueue(PHOTO_INTELLIGENCE_QUEUE, "analyze-photo", {
        photoId: photo.id.toString(),
        projectId: photo.projectId.toString(),
        storageKey: photo.storageKey.toString(),
        mimeType: photo.mimeType,
        useAi: false,
      });
      queued += 1;
    }
    return Result.success({ queued });
  }
}
