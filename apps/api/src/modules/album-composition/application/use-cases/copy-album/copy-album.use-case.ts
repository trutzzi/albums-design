import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, ValidationError, type ApplicationError } from "#src/shared-kernel/errors";
import { Album, AlbumShapeError, AlbumSizeRangeError, sizeInCm } from "#src/modules/album-composition/domain/album";
import type { AlbumRepository } from "#src/modules/album-composition/domain/album-repository";
import type { AlbumQuotaPolicy, ProjectDirectory } from "../../ports/directories";

export interface CopyAlbumCommand {
  albumId: string;
  pageWidthMm: number;
  pageHeightMm: number;
  title?: string | undefined;
}

/**
 * A second album with the same design at another size — the 20×20 copies for the
 * parents of a 30×30 main book. It is a new album, so it counts against the plan
 * exactly as a generated one does.
 */
export class CopyAlbumAtSizeUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly projects: ProjectDirectory,
    private readonly quota: AlbumQuotaPolicy,
  ) {}

  async execute(command: CopyAlbumCommand): Promise<Result<Album, ApplicationError>> {
    const original = await this.albums.findById(UniqueEntityId.create(command.albumId));
    if (!original) return Result.failure(new NotFoundError("Album", command.albumId));
    const project = await this.projects.findProject(original.projectId.toString());
    if (!project) return Result.failure(new NotFoundError("Project", original.projectId.toString()));

    const decision = await this.quota.ensureCanCreateAlbum(project.studioId);
    if (!decision.allowed) return Result.failure(new ConflictError(decision.reason ?? "Album quota reached."));

    const size = { pageWidthMm: command.pageWidthMm, pageHeightMm: command.pageHeightMm };
    let copy: Album;
    try {
      copy = original.copyAt(size, command.title ?? `${original.title} — ${sizeInCm(size)}`);
    } catch (error) {
      if (error instanceof AlbumShapeError || error instanceof AlbumSizeRangeError)
        return Result.failure(new ValidationError(error.message));
      throw error;
    }

    await this.albums.save(copy);
    await this.quota.recordAlbumCreated(project.studioId);
    return Result.success(copy);
  }
}
