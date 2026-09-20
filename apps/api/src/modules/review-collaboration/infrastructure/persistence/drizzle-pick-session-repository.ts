import { eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import { PickSession } from "../../domain/pick-session";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import { pickSessions } from "./schema";

export class DrizzlePickSessionRepository implements PickSessionRepository {
  constructor(private readonly db: Database) {}

  async save(session: PickSession): Promise<void> {
    const row = {
      id: session.id.toString(),
      projectId: session.projectId.toString(),
      tokenHash: session.tokenHash,
      clientName: session.clientName,
      status: session.status,
      pickedPhotoIds: [...session.pickedPhotoIds],
      shortlistedPhotoIds: [...session.shortlistedPhotoIds],
      stage: session.stage,
      firstReachedFinalAt: session.firstReachedFinalAt ?? null,
      pickLimit: session.pickLimit ?? null,
      expiresAt: session.expiresAt,
      submittedAt: session.submittedAt ?? null,
      createdAt: session.createdAt,
      passwordHash: session.passwordHash ?? null,
      sealedSecret: session.sealedSecret ?? null,
    };
    await this.db
      .insert(pickSessions)
      .values(row)
      .onConflictDoUpdate({
        target: pickSessions.id,
        set: {
          status: row.status,
          pickedPhotoIds: row.pickedPhotoIds,
          shortlistedPhotoIds: row.shortlistedPhotoIds,
          stage: row.stage,
          firstReachedFinalAt: row.firstReachedFinalAt,
          submittedAt: row.submittedAt,
        },
      });
  }

  async findById(id: UniqueEntityId): Promise<PickSession | undefined> {
    const [row] = await this.db
      .select()
      .from(pickSessions)
      .where(eq(pickSessions.id, id.toString()))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByTokenHash(tokenHash: string): Promise<PickSession | undefined> {
    const [row] = await this.db
      .select()
      .from(pickSessions)
      .where(eq(pickSessions.tokenHash, tokenHash))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByProjectId(projectId: UniqueEntityId): Promise<PickSession[]> {
    const rows = await this.db
      .select()
      .from(pickSessions)
      .where(eq(pickSessions.projectId, projectId.toString()));
    return rows.map(toDomain);
  }

  async deleteByProjectId(projectId: UniqueEntityId): Promise<void> {
    await this.db.delete(pickSessions).where(eq(pickSessions.projectId, projectId.toString()));
  }
}

function toDomain(row: typeof pickSessions.$inferSelect): PickSession {
  return PickSession.reconstitute(
    {
      projectId: UniqueEntityId.create(row.projectId),
      tokenHash: row.tokenHash,
      clientName: row.clientName,
      status: row.status,
      pickedPhotoIds: [...row.pickedPhotoIds],
      shortlistedPhotoIds: row.shortlistedPhotoIds ? [...row.shortlistedPhotoIds] : undefined,
      stage: row.stage ?? undefined,
      firstReachedFinalAt: row.firstReachedFinalAt ?? undefined,
      pickLimit: row.pickLimit ?? undefined,
      expiresAt: row.expiresAt,
      submittedAt: row.submittedAt ?? undefined,
      createdAt: row.createdAt,
      passwordHash: row.passwordHash ?? undefined,
      sealedSecret: row.sealedSecret ?? undefined,
    },
    UniqueEntityId.create(row.id),
  );
}
