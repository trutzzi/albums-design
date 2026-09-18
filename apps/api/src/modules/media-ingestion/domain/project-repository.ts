import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Project } from "./project";

export interface ProjectRepository {
  save(project: Project): Promise<void>;
  findById(id: UniqueEntityId): Promise<Project | undefined>;
  listByStudioId(studioId: UniqueEntityId): Promise<Project[]>;
  delete(id: UniqueEntityId): Promise<void>;
}
