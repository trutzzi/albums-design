import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { SlideshowSession } from "./slideshow-session";

export interface SlideshowSessionRepository {
  save(session: SlideshowSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<SlideshowSession | undefined>;
  findByTokenHash(tokenHash: string): Promise<SlideshowSession | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<SlideshowSession[]>;
  deleteByProjectId(projectId: UniqueEntityId): Promise<void>;
}
