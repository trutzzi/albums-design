import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PickSession } from "./pick-session";

export interface PickSessionRepository {
  save(session: PickSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<PickSession | undefined>;
  findByTokenHash(tokenHash: string): Promise<PickSession | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<PickSession[]>;
  /** Many shoots' selection links in one query, for the shoots list. */
  findByProjectIds(projectIds: UniqueEntityId[]): Promise<PickSession[]>;
  deleteByProjectId(projectId: UniqueEntityId): Promise<void>;
}
