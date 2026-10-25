import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { SlideshowSession } from "./slideshow-session";

export interface SlideshowSessionRepository {
  save(session: SlideshowSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<SlideshowSession | undefined>;
  /**
   * Counts a view by touching only the view columns. A public view must never write the
   * whole row back: racing a revoke, that would bring the link the studio just closed back.
   */
  recordView(id: UniqueEntityId, at: Date): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SlideshowSession | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<SlideshowSession[]>;
  deleteByProjectId(projectId: UniqueEntityId): Promise<void>;
}
