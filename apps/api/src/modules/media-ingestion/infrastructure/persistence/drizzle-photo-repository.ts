import { eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import type { PhotoRepository } from "../../domain/photo-repository";
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

  async markDerivativesReady(id: UniqueEntityId): Promise<void> {
    await this.db.update(photos).set({ hasDerivatives: true }).where(eq(photos.id, id.toString()));
  }

  async findById(id: UniqueEntityId): Promise<Photo | undefined> {
    const [row] = await this.db.select().from(photos).where(eq(photos.id, id.toString())).limit(1);
    if (!row) return undefined;
    return this.toDomain(row);
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
      },
      UniqueEntityId.create(row.id),
    );
  }
}
