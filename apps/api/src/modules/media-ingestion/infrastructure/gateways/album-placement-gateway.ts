import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "../../../album-composition/domain/album-repository";
import type { Album } from "../../../album-composition/domain/album";
import type { AlbumPlacementDirectory } from "../../application/ports/album-placements";

function placedPhotoIds(album: Album): string[] {
  // Empty slots carry an empty photo id.
  return album.spreads.flatMap((spread) =>
    spread.placements.map((placement) => placement.photoId).filter(Boolean),
  );
}

export class AlbumCompositionPlacementDirectory implements AlbumPlacementDirectory {
  constructor(private readonly albums: AlbumRepository) {}

  async forAlbum(albumId: string) {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return undefined;
    return { projectId: album.projectId.toString(), photoIds: [...new Set(placedPhotoIds(album))] };
  }

  async forProject(projectId: string): Promise<string[]> {
    const albums = await this.albums.findByProjectId(UniqueEntityId.create(projectId));
    return [...new Set(albums.flatMap(placedPhotoIds))];
  }
}
