import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { DownloadSessionRepository } from "../../../review-collaboration/domain/download-session-repository";
import type { DownloadHoldDirectory } from "../../application/ports/download-holds";

export class ReviewCollaborationDownloadHolds implements DownloadHoldDirectory {
  constructor(private readonly sessions: DownloadSessionRepository) {}

  async hasActiveLink(projectId: string, now: Date): Promise<boolean> {
    const sessions = await this.sessions.findByProjectId(UniqueEntityId.create(projectId));
    return sessions.some((session) => session.isActive(now));
  }
}
