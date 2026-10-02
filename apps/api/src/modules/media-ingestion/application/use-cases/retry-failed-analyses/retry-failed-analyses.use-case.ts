import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ApplicationError } from "#src/shared-kernel/errors";
import { QUEUES } from "#src/shared-kernel/job-queue";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { JobQueue } from "../../ports/job-queue";

/**
 * Queues every photo of a shoot whose analysis gave up for another try — the manual way
 * back from the dead letter. Retries use the built-in analysis (whether AI was chosen at
 * upload is not stored, and a failing AI service is the usual reason a photo failed).
 */
export class RetryFailedAnalysesUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly jobs: JobQueue,
    private readonly logger: Logger = consoleLogger,
  ) {}

  async execute(command: { projectId: string }): Promise<Result<{ queued: number }, ApplicationError>> {
    const photos = await this.photos.findByProjectId(UniqueEntityId.create(command.projectId));
    let queued = 0;
    for (const photo of photos) {
      if (photo.status !== "FAILED") continue;
      photo.retryAnalysis();
      // Two clicks, or two tabs, must not queue the same photo twice.
      if (!(await this.photos.updateStatusIf(photo.id, ["FAILED"], photo.status))) continue;
      try {
        await this.jobs.enqueue(QUEUES.photoIntelligence, "analyze-photo", {
          photoId: photo.id.toString(),
          projectId: photo.projectId.toString(),
          storageKey: photo.storageKey.toString(),
          mimeType: photo.mimeType,
          useAi: false,
        });
      } catch (error) {
        // Queued with no job behind it, the photo would read "processing" forever — exactly
        // the state this retry exists to end. Put it back so the photographer can try again.
        await this.photos.updateStatusIf(photo.id, ["ANALYSIS_QUEUED"], "FAILED");
        this.logger.error("could not queue a photo for another analysis", {
          photoId: photo.id.toString(),
          projectId: command.projectId,
          err: error,
        });
        return Result.failure(
          new ApplicationError("Could not queue the photos for analysis. Try again in a moment.", "RETRY_NOT_QUEUED"),
        );
      }
      queued += 1;
    }
    return Result.success({ queued });
  }
}
