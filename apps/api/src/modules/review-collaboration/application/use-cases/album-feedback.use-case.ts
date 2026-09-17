import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, type ApplicationError } from "../../../../shared-kernel/errors";
import type { ReviewSession } from "../../domain/review-session";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";

export interface FeedbackComment {
  id: string;
  sessionId: string;
  clientName: string;
  /** Which spread the client was looking at, and which photo on it if they said. */
  spreadIndex: number;
  slotId: string | undefined;
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface AlbumFeedback {
  albumId: string;
  comments: FeedbackComment[];
  openCount: number;
  resolvedCount: number;
  /** Every review link on this album, so the photographer knows who said what. */
  sessions: {
    id: string;
    clientName: string;
    status: string;
    openComments: number;
    expiresAt: string;
    createdAt: string;
  }[];
}

/**
 * The photographer's side of the review. A client's comments were reachable only
 * through the client's own share token, which meant the person expected to act on
 * them could not read them — the count on the editor was the whole story.
 */
export class AlbumFeedbackUseCase {
  constructor(private readonly sessions: ReviewSessionRepository) {}

  async list(albumId: string): Promise<Result<AlbumFeedback, ApplicationError>> {
    const sessions = await this.sessions.findByAlbumId(UniqueEntityId.create(albumId));
    const comments = sessions.flatMap((session) => toComments(session));

    // Unresolved first — they are the work. Within each group, album order, so the
    // list reads the same way the photographer scrolls the spreads.
    comments.sort(
      (a, b) =>
        Number(a.resolved) - Number(b.resolved) ||
        a.spreadIndex - b.spreadIndex ||
        a.createdAt.localeCompare(b.createdAt),
    );

    return Result.success({
      albumId,
      comments,
      openCount: comments.filter((comment) => !comment.resolved).length,
      resolvedCount: comments.filter((comment) => comment.resolved).length,
      sessions: sessions.map((session) => ({
        id: session.id.toString(),
        clientName: session.clientName,
        status: session.status,
        openComments: session.openComments.length,
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
      })),
    });
  }

  /**
   * Marking a comment done is the photographer's call, not the client's, so it is
   * allowed even once the link is approved or expired — otherwise a finished album
   * would keep an unresolved note forever.
   */
  async resolve(
    albumId: string,
    commentId: string,
  ): Promise<Result<AlbumFeedback, ApplicationError>> {
    const sessions = await this.sessions.findByAlbumId(UniqueEntityId.create(albumId));
    const owner = sessions.find((session) =>
      session.comments.some((comment) => comment.id === commentId),
    );
    if (!owner) return Result.failure(new NotFoundError("Comment", commentId));

    owner.resolveComment(commentId);
    await this.sessions.save(owner);
    return this.list(albumId);
  }
}

function toComments(session: ReviewSession): FeedbackComment[] {
  return session.comments.map((comment) => ({
    id: comment.id,
    sessionId: session.id.toString(),
    clientName: comment.authorName || session.clientName,
    spreadIndex: comment.spreadIndex,
    slotId: comment.slotId,
    body: comment.body,
    resolved: comment.resolved,
    createdAt: comment.createdAt.toISOString(),
  }));
}
