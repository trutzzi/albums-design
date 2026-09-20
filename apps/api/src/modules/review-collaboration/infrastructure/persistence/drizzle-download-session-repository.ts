import { eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import { DownloadSession } from "../../domain/download-session";
import type { DownloadSessionRepository } from "../../domain/download-session-repository";
import { downloadSessions } from "./schema";

export class DrizzleDownloadSessionRepository implements DownloadSessionRepository {
  constructor(private readonly db: Database) {}

  async save(session: DownloadSession): Promise<void> {
    const row = {
      id: session.id.toString(),
      projectId: session.projectId.toString(),
      tokenHash: session.tokenHash,
      clientName: session.clientName,
      status: session.status,
      expiresAt: session.expiresAt,
      downloadCount: session.downloadCount,
      firstDownloadedAt: session.firstDownloadedAt ?? null,
      lastDownloadedAt: session.lastDownloadedAt ?? null,
      createdAt: session.createdAt,
      passwordHash: session.passwordHash ?? null,
      sealedSecret: session.sealedSecret ?? null,
    };
    await this.db
      .insert(downloadSessions)
      .values(row)
      .onConflictDoUpdate({
        target: downloadSessions.id,
        set: {
          status: row.status,
          downloadCount: row.downloadCount,
          firstDownloadedAt: row.firstDownloadedAt,
          lastDownloadedAt: row.lastDownloadedAt,
        },
      });
  }

  async findById(id: UniqueEntityId): Promise<DownloadSession | undefined> {
    const [row] = await this.db.select().from(downloadSessions).where(eq(downloadSessions.id, id.toString())).limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByTokenHash(tokenHash: string): Promise<DownloadSession | undefined> {
    const [row] = await this.db
      .select()
      .from(downloadSessions)
      .where(eq(downloadSessions.tokenHash, tokenHash))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByProjectId(projectId: UniqueEntityId): Promise<DownloadSession[]> {
    const rows = await this.db
      .select()
      .from(downloadSessions)
      .where(eq(downloadSessions.projectId, projectId.toString()));
    return rows.map(toDomain);
  }

  async deleteByProjectId(projectId: UniqueEntityId): Promise<void> {
    await this.db.delete(downloadSessions).where(eq(downloadSessions.projectId, projectId.toString()));
  }
}

function toDomain(row: typeof downloadSessions.$inferSelect): DownloadSession {
  return DownloadSession.reconstitute(
    {
      projectId: UniqueEntityId.create(row.projectId),
      tokenHash: row.tokenHash,
      clientName: row.clientName,
      status: row.status,
      expiresAt: row.expiresAt,
      downloadCount: row.downloadCount,
      firstDownloadedAt: row.firstDownloadedAt ?? undefined,
      lastDownloadedAt: row.lastDownloadedAt ?? undefined,
      createdAt: row.createdAt,
      passwordHash: row.passwordHash ?? undefined,
      sealedSecret: row.sealedSecret ?? undefined,
    },
    UniqueEntityId.create(row.id),
  );
}
