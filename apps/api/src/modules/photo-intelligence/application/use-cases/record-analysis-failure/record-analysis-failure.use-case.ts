import { Result } from "@albumflow/domain-kernel";
import type { ApplicationError } from "#src/shared-kernel/errors";
import type { PhotoLifecycle } from "../../ports/photo-lifecycle";

/**
 * Closes out a photo whose analysis failed on its last attempt. Without it the photo stays
 * "queued" for good: its shoot reads "247 / 248 analysed" forever and the shoots list keeps
 * polling for progress that will never come. (The job runner logs the failure itself.)
 */
export class RecordAnalysisFailureUseCase {
  constructor(private readonly lifecycle: PhotoLifecycle) {}

  async execute(command: { photoId: string }): Promise<Result<void, ApplicationError>> {
    await this.lifecycle.markAnalysisFailed(command.photoId);
    return Result.success(undefined);
  }
}
