import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, type ApplicationError } from "../../../../shared-kernel/errors";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";
import type { ClientAccessService } from "../services/client-access.service";

/** The studio's window onto an album review link: the link itself and its password, readable again later. */
export class ReviewAccessUseCase {
  constructor(
    private readonly sessions: ReviewSessionRepository,
    private readonly access: ClientAccessService,
  ) {}

  async reveal(
    albumId: string,
    sessionId: string,
  ): Promise<Result<{ token: string; password: string }, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    // The album in the path is what tenancy verified; the link must belong to it.
    if (!session || session.albumId.toString() !== albumId) {
      return Result.failure(new NotFoundError("Review link", sessionId));
    }
    const revealed = this.access.reveal(session);
    if (!revealed) {
      return Result.failure(
        new ConflictError(
          "This link was created before links could be shown again, so its details are not stored. Create a new link to get a viewable one.",
        ),
      );
    }
    return Result.success(revealed);
  }
}
