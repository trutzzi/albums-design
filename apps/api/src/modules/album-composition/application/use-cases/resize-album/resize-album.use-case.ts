import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, ValidationError, type ApplicationError } from "#src/shared-kernel/errors";
import { Album, AlbumLockedError, AlbumShapeError } from "#src/modules/album-composition/domain/album";
import type { AlbumRepository } from "#src/modules/album-composition/domain/album-repository";

export interface ResizeAlbumCommand {
  albumId: string;
  pageWidthMm: number;
  pageHeightMm: number;
}

/**
 * Prints this album at another size of the same shape — 25×25 to 30×30, say. The design
 * carries over untouched; print sharpness is the photographer's call, which the editor
 * shows them before they confirm. PDFs already made keep the size they were made at.
 */
export class ResizeAlbumUseCase {
  constructor(private readonly albums: AlbumRepository) {}

  async execute(command: ResizeAlbumCommand): Promise<Result<Album, ApplicationError>> {
    const album = await this.albums.findById(UniqueEntityId.create(command.albumId));
    if (!album) return Result.failure(new NotFoundError("Album", command.albumId));

    try {
      album.resize({ pageWidthMm: command.pageWidthMm, pageHeightMm: command.pageHeightMm });
    } catch (error) {
      if (error instanceof AlbumLockedError) return Result.failure(new ConflictError(error.message));
      if (error instanceof AlbumShapeError) return Result.failure(new ValidationError(error.message));
      throw error;
    }

    await this.albums.save(album);
    return Result.success(album);
  }
}
