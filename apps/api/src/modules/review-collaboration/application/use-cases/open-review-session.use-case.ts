import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, type ApplicationError } from "../../../../shared-kernel/errors";
import { ReviewSession } from "../../domain/review-session";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";
import type { AlbumGateway } from "../ports/album-gateway";

export interface OpenReviewSessionCommand {
  albumId: string;
  clientName: string;
  ttlDays?: number;
}

export interface OpenReviewSessionResult {
  sessionId: string;
  token: string;
  expiresAt: string;
}

export class OpenReviewSessionUseCase {
  constructor(
    private readonly sessions: ReviewSessionRepository,
    private readonly albums: AlbumGateway,
  ) {}

  async execute(
    command: OpenReviewSessionCommand,
  ): Promise<Result<OpenReviewSessionResult, ApplicationError>> {
    const album = await this.albums.load(command.albumId);
    if (!album) return Result.failure(new NotFoundError("Album", command.albumId));

    const { session, token } = ReviewSession.open({
      albumId: UniqueEntityId.create(command.albumId),
      clientName: command.clientName,
      ...(command.ttlDays ? { ttlDays: command.ttlDays } : {}),
    });

    await this.sessions.save(session);
    await this.albums.markInReview(command.albumId);

    return Result.success({
      sessionId: session.id.toString(),
      token,
      expiresAt: session.expiresAt.toISOString(),
    });
  }
}
