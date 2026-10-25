import { eq, sql } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "#src/db/client";
import { SlideshowSession } from "../../domain/slideshow-session";
import type { SlideshowSessionRepository } from "../../domain/slideshow-session-repository";
import { slideshowSessions } from "./schema";

export class DrizzleSlideshowSessionRepository implements SlideshowSessionRepository {
  constructor(private readonly db: Database) {}

  async save(session: SlideshowSession): Promise<void> {
    const row = {
      id: session.id.toString(),
      projectId: session.projectId.toString(),
      tokenHash: session.tokenHash,
      clientName: session.clientName,
      status: session.status,
      source: session.source,
      albumId: session.albumId ?? null,
      photoIds: [...session.photoIds],
      intervalSeconds: session.settings.intervalSeconds,
      transition: session.settings.transition,
      expiresAt: session.expiresAt,
      viewCount: session.viewCount,
      lastViewedAt: session.lastViewedAt ?? null,
      createdAt: session.createdAt,
      lastSentTo: session.lastSentTo ?? null,
      lastSentAt: session.lastSentAt ?? null,
      sealedSecret: session.sealedSecret ?? null,
    };
    await this.db
      .insert(slideshowSessions)
      .values(row)
      .onConflictDoUpdate({
        target: slideshowSessions.id,
        set: {
          status: row.status,
          expiresAt: row.expiresAt,
          photoIds: row.photoIds,
          intervalSeconds: row.intervalSeconds,
          transition: row.transition,
          viewCount: row.viewCount,
          lastViewedAt: row.lastViewedAt,
          lastSentTo: row.lastSentTo,
          lastSentAt: row.lastSentAt,
        },
      });
  }

  async findById(id: UniqueEntityId): Promise<SlideshowSession | undefined> {
    const [row] = await this.db
      .select()
      .from(slideshowSessions)
      .where(eq(slideshowSessions.id, id.toString()))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async recordView(id: UniqueEntityId, at: Date): Promise<void> {
    await this.db
      .update(slideshowSessions)
      .set({ viewCount: sql`${slideshowSessions.viewCount} + 1`, lastViewedAt: at })
      .where(eq(slideshowSessions.id, id.toString()));
  }

  async findByTokenHash(tokenHash: string): Promise<SlideshowSession | undefined> {
    const [row] = await this.db
      .select()
      .from(slideshowSessions)
      .where(eq(slideshowSessions.tokenHash, tokenHash))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByProjectId(projectId: UniqueEntityId): Promise<SlideshowSession[]> {
    const rows = await this.db
      .select()
      .from(slideshowSessions)
      .where(eq(slideshowSessions.projectId, projectId.toString()));
    return rows.map(toDomain);
  }

  async deleteByProjectId(projectId: UniqueEntityId): Promise<void> {
    await this.db.delete(slideshowSessions).where(eq(slideshowSessions.projectId, projectId.toString()));
  }
}

function toDomain(row: typeof slideshowSessions.$inferSelect): SlideshowSession {
  return SlideshowSession.reconstitute(
    {
      projectId: UniqueEntityId.create(row.projectId),
      tokenHash: row.tokenHash,
      clientName: row.clientName,
      status: row.status,
      source: row.source,
      albumId: row.albumId ?? undefined,
      photoIds: row.photoIds,
      settings: { intervalSeconds: row.intervalSeconds, transition: row.transition },
      expiresAt: row.expiresAt,
      viewCount: row.viewCount,
      lastViewedAt: row.lastViewedAt ?? undefined,
      createdAt: row.createdAt,
      lastSentTo: row.lastSentTo ?? undefined,
      lastSentAt: row.lastSentAt ?? undefined,
      sealedSecret: row.sealedSecret ?? undefined,
    },
    UniqueEntityId.create(row.id),
  );
}
