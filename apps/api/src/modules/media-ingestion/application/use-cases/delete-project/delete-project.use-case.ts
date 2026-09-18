import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, type ApplicationError } from "../../../../../shared-kernel/errors";
import type { ProjectRepository } from "../../../domain/project-repository";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { ObjectStorageWithBody } from "../../ports/object-storage";
import type { PhotoAnalysisRepository } from "../../../../photo-intelligence/domain/photo-analysis-repository";
import type { AlbumRepository } from "../../../../album-composition/domain/album-repository";
import type { ExportJobRepository } from "../../../../export-print/domain/export-job-repository";
import type { ExportStorage } from "../../../../export-print/application/ports/album-pdf-renderer";
import type { ReviewSessionRepository } from "../../../../review-collaboration/domain/review-session-repository";

export interface DeleteProjectCommand {
  projectId: string;
}

/**
 * Removes an entire shoot: every album built from it (with its own exports
 * and review sessions, same as DeleteAlbumUseCase), every uploaded photo
 * (original and derivative files in storage, plus its analysis), and finally
 * the shoot itself. Refuses while any album has an export still QUEUED or
 * RENDERING, checked across all of them before anything is touched, so a
 * partial delete never leaves some albums gone and others not.
 */
export class DeleteProjectUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly photos: PhotoRepository,
    private readonly photoStorage: ObjectStorageWithBody,
    private readonly analyses: PhotoAnalysisRepository,
    private readonly albums: AlbumRepository,
    private readonly exportJobs: ExportJobRepository,
    private readonly exportStorage: ExportStorage,
    private readonly reviewSessions: ReviewSessionRepository,
  ) {}

  async execute(command: DeleteProjectCommand): Promise<Result<void, ApplicationError>> {
    const id = UniqueEntityId.create(command.projectId);
    const project = await this.projects.findById(id);
    if (!project) return Result.failure(new NotFoundError("Project", command.projectId));

    const albums = await this.albums.findByProjectId(id);
    const exportsByAlbum = await Promise.all(
      albums.map((album) => this.exportJobs.findByAlbumId(album.id)),
    );
    if (exportsByAlbum.some((jobs) => jobs.some((job) => job.status === "QUEUED" || job.status === "RENDERING"))) {
      return Result.failure(
        new ConflictError(
          "This shoot has an album with an export still in progress — wait for it to finish first.",
        ),
      );
    }

    for (let i = 0; i < albums.length; i++) {
      const album = albums[i]!;
      for (const job of exportsByAlbum[i]!) {
        if (job.storageKey) await this.exportStorage.delete(job.storageKey);
        await this.exportJobs.delete(job.id);
      }

      const sessions = await this.reviewSessions.findByAlbumId(album.id);
      for (const session of sessions) {
        await this.reviewSessions.delete(session.id);
      }

      await this.albums.delete(album.id);
    }

    const photos = await this.photos.findByProjectId(id);
    for (const photo of photos) {
      await this.photoStorage.delete(photo.storageKey.toString());
      await this.photoStorage.delete(photo.storageKey.derivative("thumb").toString());
      await this.photoStorage.delete(photo.storageKey.derivative("preview").toString());
      await this.analyses.delete(photo.id);
      await this.photos.delete(photo.id);
    }

    await this.projects.delete(id);

    return Result.success(undefined);
  }
}
