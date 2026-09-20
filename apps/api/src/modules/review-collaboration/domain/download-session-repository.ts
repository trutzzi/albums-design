import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { DownloadSession } from "./download-session";

export interface DownloadSessionRepository {
  save(session: DownloadSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<DownloadSession | undefined>;
  findByTokenHash(tokenHash: string): Promise<DownloadSession | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<DownloadSession[]>;
  deleteByProjectId(projectId: UniqueEntityId): Promise<void>;
}
