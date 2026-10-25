import { eq, inArray } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { galleryOverrideSchema } from "@albumflow/contracts";
import type { Database } from "#src/db/client";
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
      lastSentTo: session.lastSentTo ?? null,
      lastSentAt: session.lastSentAt ?? null,
      passwordHash: session.passwordHash ?? null,
      sealedSecret: session.sealedSecret ?? null,
      coverPhotoId: session.coverPhotoId ?? null,
      lookOverride: session.lookOverride ?? null,
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
          lastSentTo: row.lastSentTo,
          lastSentAt: row.lastSentAt,
          coverPhotoId: row.coverPhotoId,
          lookOverride: row.lookOverride,
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

  async findByProjectIds(projectIds: UniqueEntityId[]): Promise<DownloadSession[]> {
    if (projectIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(downloadSessions)
      .where(
        inArray(
          downloadSessions.projectId,
          projectIds.map((id) => id.toString()),
        ),
      );
    return rows.map(toDomain);
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
      lastSentTo: row.lastSentTo ?? undefined,
      lastSentAt: row.lastSentAt ?? undefined,
      passwordHash: row.passwordHash ?? undefined,
      sealedSecret: row.sealedSecret ?? undefined,
      coverPhotoId: row.coverPhotoId ?? undefined,
      lookOverride: readOverride(row.lookOverride),
    },
    UniqueEntityId.create(row.id),
  );
}

/** A stored override that no longer matches the schema is dropped rather than breaking the link. */
function readOverride(stored: unknown) {
  if (stored === null || stored === undefined) return undefined;
  const parsed = galleryOverrideSchema.safeParse(stored);
  return parsed.success ? parsed.data : undefined;
}
