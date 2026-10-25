import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PickSession } from "./pick-session";

export interface PickSessionRepository {
  save(session: PickSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<PickSession | undefined>;
  findByTokenHash(tokenHash: string): Promise<PickSession | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<PickSession[]>;
  /**
   * Many shoots' selection links in one query, for the shoots list — just what a card needs,
   * with the picks counted in the database rather than loaded.
   */
  progressByProjectIds(projectIds: UniqueEntityId[]): Promise<PickProgress[]>;
  deleteByProjectId(projectId: UniqueEntityId): Promise<void>;
}

export interface PickProgress {
  projectId: string;
  status: string;
  clientName: string;
  pickedCount: number;
  submittedAt: Date | null;
}
