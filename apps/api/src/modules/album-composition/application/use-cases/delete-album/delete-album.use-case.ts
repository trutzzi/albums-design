import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, type ApplicationError } from "../../../../../shared-kernel/errors";
import type { AlbumRepository } from "../../../domain/album-repository";
import type { ExportJobRepository } from "../../../../export-print/domain/export-job-repository";
import type { ExportStorage } from "../../../../export-print/application/ports/album-pdf-renderer";
import type { ReviewSessionRepository } from "../../../../review-collaboration/domain/review-session-repository";

export interface DeleteAlbumCommand {
  albumId: string;
}

/**
 * Removes an album entirely, along with everything that points back at it —
 * its exports (storage object and record) and its review sessions — since
 * neither table cascades on its own and an orphaned row would just be a
 * confusing 404 waiting to happen later. Refuses while an export is still
 * QUEUED or RENDERING, the same guard DeleteExportUseCase applies to a single
 * export, for the same reason: deleting out from under the worker either
 * orphans a file it's about to write or makes it fail on a vanished record.
 */
export class DeleteAlbumUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly exportJobs: ExportJobRepository,
    private readonly exportStorage: ExportStorage,
    private readonly reviewSessions: ReviewSessionRepository,
  ) {}

  async execute(command: DeleteAlbumCommand): Promise<Result<void, ApplicationError>> {
    const id = UniqueEntityId.create(command.albumId);
    const album = await this.albums.findById(id);
    if (!album) return Result.failure(new NotFoundError("Album", command.albumId));

    const exports = await this.exportJobs.findByAlbumId(id);
    if (exports.some((job) => job.status === "QUEUED" || job.status === "RENDERING")) {
      return Result.failure(
        new ConflictError(
          "This album has an export still in progress — wait for it to finish first.",
        ),
      );
    }

    for (const job of exports) {
      if (job.storageKey) await this.exportStorage.delete(job.storageKey);
      await this.exportJobs.delete(job.id);
    }

    const sessions = await this.reviewSessions.findByAlbumId(id);
    for (const session of sessions) {
      await this.reviewSessions.delete(session.id);
    }

    await this.albums.delete(id);

    return Result.success(undefined);
  }
}
