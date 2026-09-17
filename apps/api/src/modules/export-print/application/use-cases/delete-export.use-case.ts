import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import type { ExportJobRepository } from "../../domain/export-job-repository";
import type { ExportStorage } from "../ports/album-pdf-renderer";

export interface DeleteExportCommand {
  exportJobId: string;
}

/**
 * Removes an export the photographer no longer wants to keep — a superseded
 * proof, a failed attempt, a client's own reject. Deliberately refuses a job
 * that's still QUEUED or RENDERING: deleting out from under the worker would
 * either orphan a file it's about to write, or make it fail confusingly when
 * it goes looking for a job record that's gone. Once a job is READY or FAILED
 * nothing further touches it, so deleting is safe.
 */
export class DeleteExportUseCase {
  constructor(
    private readonly jobs: ExportJobRepository,
    private readonly storage: ExportStorage,
  ) {}

  async execute(command: DeleteExportCommand): Promise<Result<void, ApplicationError>> {
    const id = UniqueEntityId.create(command.exportJobId);
    const job = await this.jobs.findById(id);
    if (!job) return Result.failure(new NotFoundError("Export job", command.exportJobId));

    if (job.status === "QUEUED" || job.status === "RENDERING") {
      return Result.failure(
        new ConflictError("This export is still in progress — wait for it to finish first."),
      );
    }

    if (job.storageKey) {
      await this.storage.delete(job.storageKey);
    }
    await this.jobs.delete(id);

    return Result.success(undefined);
  }
}
