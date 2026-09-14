import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Photo } from "./photo";

export interface PhotoRepository {
  save(photo: Photo): Promise<void>;
  findById(id: UniqueEntityId): Promise<Photo | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<Photo[]>;
}
