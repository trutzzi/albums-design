import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PickSessionRepository } from "../../../review-collaboration/domain/pick-session-repository";
import type { ClientPickDirectory } from "../../application/ports/client-picks";

export class ReviewCollaborationClientPickDirectory implements ClientPickDirectory {
  constructor(private readonly sessions: PickSessionRepository) {}

  async forProject(projectId: string): Promise<string[]> {
    const sessions = await this.sessions.findByProjectId(UniqueEntityId.create(projectId));
    // An open session's picks are still being made and may change; only sent selections count.
    const submitted = sessions.filter((session) => session.status === "SUBMITTED");
    return [...new Set(submitted.flatMap((session) => [...session.pickedPhotoIds]))];
  }
}
