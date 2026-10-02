import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "#src/db/client";
import type { PhotoRepository, ShootPhotoCounts } from "../../domain/photo-repository";
import { Photo, type PhotoStatus } from "../../domain/photo";
import { StorageKey } from "../../domain/value-objects/storage-key";
import { photos } from "./schema";

export class DrizzlePhotoRepository implements PhotoRepository {
  constructor(private readonly db: Database) {}

  async save(photo: Photo): Promise<void> {
    await this.db
      .insert(photos)
      .values({
        id: photo.id.toString(),
        projectId: photo.projectId.toString(),
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        storageKey: photo.storageKey.toString(),
        byteSize: photo.byteSize,
        status: photo.status,
        checksum: photo.checksum,
        createdAt: photo.createdAt,
        uploadedAt: photo.uploadedAt,
        hasDerivatives: photo.hasDerivatives,
        permanentDerivatives: photo.permanentDerivatives,
        selectedAt: photo.selectedAt,
        fullResStoredAt: photo.fullResStoredAt,
        stagedOriginalPurgedAt: photo.stagedOriginalPurgedAt,
      })
      .onConflictDoUpdate({
        target: photos.id,
        set: {
          byteSize: photo.byteSize,
          status: photo.status,
          checksum: photo.checksum,
          uploadedAt: photo.uploadedAt,
          hasDerivatives: photo.hasDerivatives,
        },
      });
    photo.clearDomainEvents();
  }

  async updateStatus(id: UniqueEntityId, status: PhotoStatus): Promise<void> {
    await this.db.update(photos).set({ status }).where(eq(photos.id, id.toString()));
  }

  async markDerivativesReady(id: UniqueEntityId, options: { permanent?: boolean } = {}): Promise<void> {
    await this.db
      .update(photos)
      .set({ hasDerivatives: true, ...(options.permanent ? { permanentDerivatives: true } : {}) })
      .where(eq(photos.id, id.toString()));
  }

  async markSelected(ids: UniqueEntityId[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(photos)
      .set({ selectedAt: at })
      .where(
        and(
          inArray(
            photos.id,
            ids.map((id) => id.toString()),
          ),
          isNull(photos.selectedAt),
        ),
      );
  }

  async markFullResStored(id: UniqueEntityId, at: Date): Promise<void> {
    await this.db.update(photos).set({ fullResStoredAt: at }).where(eq(photos.id, id.toString()));
  }

  async markStagedOriginalPurged(id: UniqueEntityId, at: Date): Promise<void> {
    await this.db.update(photos).set({ stagedOriginalPurgedAt: at }).where(eq(photos.id, id.toString()));
  }

  async findAwaitingLongTermStorage(limit: number): Promise<Photo[]> {
    const rows = await this.db
      .select()
      .from(photos)
      .where(
        and(ne(photos.status, "PENDING_UPLOAD"), isNull(photos.fullResStoredAt), isNull(photos.stagedOriginalPurgedAt)),
      )
      .orderBy(asc(photos.createdAt))
      .limit(limit);
    return rows.map((row) => this.toDomain(row));
  }

  async countByProjectIds(projectIds: UniqueEntityId[]): Promise<Record<string, ShootPhotoCounts>> {
    if (projectIds.length === 0) return {};
    const rows = await this.db
      .select({
        projectId: photos.projectId,
        total: count(),
        processing: sql<number>`count(*) filter (where ${photos.status} in ('UPLOADED', 'ANALYSIS_QUEUED'))`,
      })
      .from(photos)
      .where(
        and(
          inArray(
            photos.projectId,
            projectIds.map((id) => id.toString()),
          ),
          ne(photos.status, "PENDING_UPLOAD"),
        ),
      )
      .groupBy(photos.projectId);
    return Object.fromEntries(
      rows.map((row) => [row.projectId, { total: Number(row.total), processing: Number(row.processing) }]),
    );
  }

  async findCoverPhotos(projectIds: UniqueEntityId[]): Promise<Map<string, Photo>> {
    if (projectIds.length === 0) return new Map();
    // DISTINCT ON keeps the first row per shoot in ORDER BY order; (project_id, file_name) is indexed.
    const rows = await this.db
      .selectDistinctOn([photos.projectId])
      .from(photos)
      .where(
        and(
          inArray(
            photos.projectId,
            projectIds.map((id) => id.toString()),
          ),
          eq(photos.hasDerivatives, true),
        ),
      )
      .orderBy(photos.projectId, asc(photos.fileName));
    return new Map(rows.map((row) => [row.projectId, this.toDomain(row)]));
  }

  async findById(id: UniqueEntityId): Promise<Photo | undefined> {
    const [row] = await this.db.select().from(photos).where(eq(photos.id, id.toString())).limit(1);
    if (!row) return undefined;
    return this.toDomain(row);
  }

  async findByIds(ids: UniqueEntityId[]): Promise<Photo[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(photos)
      .where(
        inArray(
          photos.id,
          ids.map((id) => id.toString()),
        ),
      );
    return rows.map((row) => this.toDomain(row));
  }

  async findByProjectId(projectId: UniqueEntityId): Promise<Photo[]> {
    const rows = await this.db.select().from(photos).where(eq(photos.projectId, projectId.toString()));
    return rows.map((row) => this.toDomain(row));
  }

  async delete(id: UniqueEntityId): Promise<void> {
    await this.db.delete(photos).where(eq(photos.id, id.toString()));
  }

  private toDomain(row: typeof photos.$inferSelect): Photo {
    return Photo.reconstitute(
      {
        projectId: UniqueEntityId.create(row.projectId),
        fileName: row.fileName,
        mimeType: row.mimeType,
        storageKey: StorageKey.fromExisting(row.storageKey),
        byteSize: row.byteSize,
        status: row.status,
        checksum: row.checksum ?? undefined,
        createdAt: row.createdAt,
        uploadedAt: row.uploadedAt ?? undefined,
        hasDerivatives: row.hasDerivatives,
        permanentDerivatives: row.permanentDerivatives,
        selectedAt: row.selectedAt ?? undefined,
        fullResStoredAt: row.fullResStoredAt ?? undefined,
        stagedOriginalPurgedAt: row.stagedOriginalPurgedAt ?? undefined,
      },
      UniqueEntityId.create(row.id),
    );
  }
}
