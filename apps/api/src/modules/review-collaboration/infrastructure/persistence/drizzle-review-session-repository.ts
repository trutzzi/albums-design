import { eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import { ReviewSession } from "../../domain/review-session";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";
import { reviewSessions } from "./schema";

export class DrizzleReviewSessionRepository implements ReviewSessionRepository {
  constructor(private readonly db: Database) {}

  async save(session: ReviewSession): Promise<void> {
    const row = {
      id: session.id.toString(),
      albumId: session.albumId.toString(),
      tokenHash: session.tokenHash,
      clientName: session.clientName,
      status: session.status,
      comments: session.comments.map((comment) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      })),
      expiresAt: session.expiresAt,
      approvedAt: session.approvedAt ?? null,
      createdAt: session.createdAt,
    };
    await this.db
      .insert(reviewSessions)
      .values(row)
      .onConflictDoUpdate({
        target: reviewSessions.id,
        set: { status: row.status, comments: row.comments, approvedAt: row.approvedAt },
      });
  }

  async findById(id: UniqueEntityId): Promise<ReviewSession | undefined> {
    const [row] = await this.db
      .select()
      .from(reviewSessions)
      .where(eq(reviewSessions.id, id.toString()))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByTokenHash(tokenHash: string): Promise<ReviewSession | undefined> {
    const [row] = await this.db
      .select()
      .from(reviewSessions)
      .where(eq(reviewSessions.tokenHash, tokenHash))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByAlbumId(albumId: UniqueEntityId): Promise<ReviewSession[]> {
    const rows = await this.db
      .select()
      .from(reviewSessions)
      .where(eq(reviewSessions.albumId, albumId.toString()));
    return rows.map(toDomain);
  }

  async delete(id: UniqueEntityId): Promise<void> {
    await this.db.delete(reviewSessions).where(eq(reviewSessions.id, id.toString()));
  }
}

function toDomain(row: typeof reviewSessions.$inferSelect): ReviewSession {
  return ReviewSession.reconstitute(
    {
      albumId: UniqueEntityId.create(row.albumId),
      tokenHash: row.tokenHash,
      clientName: row.clientName,
      status: row.status,
      comments: row.comments.map((comment) => ({
        ...comment,
        createdAt: new Date(comment.createdAt),
      })),
      expiresAt: row.expiresAt,
      approvedAt: row.approvedAt ?? undefined,
      createdAt: row.createdAt,
    },
    UniqueEntityId.create(row.id),
  );
}
