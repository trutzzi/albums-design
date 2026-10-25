import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "#src/modules/album-composition/domain/album-repository";
import type { ShootAlbums } from "../../application/ports/shoot-albums";

export class AlbumCompositionShootAlbums implements ShootAlbums {
  constructor(private readonly albums: Pick<AlbumRepository, "findByProjectId">) {}

  async forProject(projectId: string) {
    const albums = await this.albums.findByProjectId(UniqueEntityId.create(projectId));
    return albums.map((album) => ({ id: album.id.toString(), createdAt: album.createdAt }));
  }
}
