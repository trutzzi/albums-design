import { Result } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import {
  ReviewClosedError,
  ReviewExpiredError,
  hashToken,
  type ReviewSession,
} from "../../domain/review-session";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";
import type { AlbumGateway, ReviewNotifier, ReviewableAlbum } from "../ports/album-gateway";
import type { ClientAccessService } from "../services/client-access.service";

export interface ReviewView {
  session: {
    id: string;
    clientName: string;
    status: string;
    expiresAt: string;
    comments: {
      id: string;
      spreadIndex: number;
      slotId: string | undefined;
      body: string;
      authorName: string;
      resolved: boolean;
      createdAt: string;
    }[];
  };
  album: ReviewableAlbum;
}

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED";

/**
 * Every client-facing operation is scoped by the share token — there is no other
 * authentication on the review portal, so the token check is the security boundary.
 */
export class ReviewPortalUseCase {
  constructor(
    private readonly sessions: ReviewSessionRepository,
    private readonly albums: AlbumGateway,
    private readonly notifier: ReviewNotifier,
    private readonly access?: ClientAccessService,
  ) {}

  /** Every client route calls this first: a protected link answers PASSWORD_REQUIRED until unlocked. */
  async authorize(token: string, grant: string | undefined): Promise<Result<void, ApplicationError>> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session) return Result.failure(new NotFoundError("Review link", "token"));
    return this.access ? this.access.authorize("review", session, grant) : Result.success(undefined);
  }

  async unlock(token: string, password: string): Promise<Result<{ grant: string }, ApplicationError>> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session) return Result.failure(new NotFoundError("Review link", "token"));
    if (!this.access) return Result.failure(new NotFoundError("Review link", "token"));
    const granted = await this.access.unlock("review", session, password);
    return granted.isFailure ? Result.failure(granted.getError()) : Result.success({ grant: granted.getValue() });
  }

  async view(token: string): Promise<Result<ReviewView, ApplicationError>> {
    const resolved = await this.resolve(token);
    if (resolved.isFailure) return Result.failure(resolved.getError());
    const { session, album } = resolved.getValue();
    return Result.success(toView(session, album));
  }

  async comment(
    token: string,
    input: { spreadIndex: number; slotId?: string | undefined; body: string },
  ): Promise<Result<ReviewView, ApplicationError>> {
    const resolved = await this.resolve(token);
    if (resolved.isFailure) return Result.failure(resolved.getError());
    const { session, album } = resolved.getValue();

    if (input.spreadIndex < 0 || input.spreadIndex >= album.spreads.length) {
      return Result.failure(new ValidationError(`Spread ${input.spreadIndex} is not in this album.`));
    }

    try {
      session.addComment({
        spreadIndex: input.spreadIndex,
        slotId: input.slotId,
        body: input.body,
        authorName: session.clientName,
      });
    } catch (error) {
      return Result.failure(toApplicationError(error));
    }

    await this.sessions.save(session);
    return Result.success(toView(session, album));
  }

  async decide(
    token: string,
    decision: ReviewDecision,
  ): Promise<Result<ReviewView, ApplicationError>> {
    const resolved = await this.resolve(token);
    if (resolved.isFailure) return Result.failure(resolved.getError());
    const { session, album } = resolved.getValue();

    try {
      if (decision === "APPROVED") session.approve();
      else session.requestChanges();
    } catch (error) {
      return Result.failure(toApplicationError(error));
    }

    await this.sessions.save(session);
    if (decision === "APPROVED") await this.albums.markApproved(album.id);
    else await this.albums.markChangesRequested(album.id);

    await this.notifier.clientDecided({
      albumId: album.id,
      decision,
      clientName: session.clientName,
      openComments: session.openComments.length,
    });

    const refreshed = await this.albums.load(album.id);
    return Result.success(toView(session, refreshed ?? album));
  }

  private async resolve(
    token: string,
  ): Promise<Result<{ session: ReviewSession; album: ReviewableAlbum }, ApplicationError>> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session) return Result.failure(new NotFoundError("Review link", "token"));

    const album = await this.albums.load(session.albumId.toString());
    if (!album) return Result.failure(new NotFoundError("Album", session.albumId.toString()));

    return Result.success({ session, album });
  }
}

function toApplicationError(error: unknown): ApplicationError {
  if (error instanceof ReviewClosedError || error instanceof ReviewExpiredError) {
    return new ConflictError(error.message);
  }
  if (error instanceof Error) return new ValidationError(error.message);
  return new ValidationError("Review action failed.");
}

function toView(session: ReviewSession, album: ReviewableAlbum): ReviewView {
  return {
    session: {
      id: session.id.toString(),
      clientName: session.clientName,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      comments: session.comments.map((comment) => ({
        id: comment.id,
        spreadIndex: comment.spreadIndex,
        slotId: comment.slotId,
        body: comment.body,
        authorName: comment.authorName,
        resolved: comment.resolved,
        createdAt: comment.createdAt.toISOString(),
      })),
    },
    album,
  };
}
