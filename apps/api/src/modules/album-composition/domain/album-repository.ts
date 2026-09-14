import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Album } from "./album";

export interface AlbumRepository {
  save(album: Album): Promise<void>;
  findById(id: UniqueEntityId): Promise<Album | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<Album[]>;
  countCreatedSince(studioId: UniqueEntityId, since: Date): Promise<number>;
}
