import { desc, eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import { ExportJob } from "../../domain/export-job";
import type { ExportJobRepository } from "../../domain/export-job-repository";
import { exportJobs } from "./schema";

export class DrizzleExportJobRepository implements ExportJobRepository {
  constructor(private readonly db: Database) {}

  async save(job: ExportJob): Promise<void> {
    const row = {
      id: job.id.toString(),
      albumId: job.albumId.toString(),
      printProfileId: job.printProfileId,
      status: job.status,
      storageKey: job.storageKey ?? null,
      byteSize: job.byteSize ?? null,
      pageCount: job.pageCount ?? null,
      failureReason: job.failureReason ?? null,
      requestedAt: job.requestedAt,
      completedAt: job.completedAt ?? null,
    };
    await this.db
      .insert(exportJobs)
      .values(row)
      .onConflictDoUpdate({
        target: exportJobs.id,
        set: {
          status: row.status,
          storageKey: row.storageKey,
          byteSize: row.byteSize,
          pageCount: row.pageCount,
          failureReason: row.failureReason,
          completedAt: row.completedAt,
        },
      });
  }

  async findById(id: UniqueEntityId): Promise<ExportJob | undefined> {
    const [row] = await this.db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, id.toString()))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByAlbumId(albumId: UniqueEntityId): Promise<ExportJob[]> {
    const rows = await this.db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.albumId, albumId.toString()))
      .orderBy(desc(exportJobs.requestedAt));
    return rows.map(toDomain);
  }
}

function toDomain(row: typeof exportJobs.$inferSelect): ExportJob {
  return ExportJob.reconstitute(
    {
      albumId: UniqueEntityId.create(row.albumId),
      printProfileId: row.printProfileId,
      status: row.status,
      storageKey: row.storageKey ?? undefined,
      byteSize: row.byteSize ?? undefined,
      pageCount: row.pageCount ?? undefined,
      failureReason: row.failureReason ?? undefined,
      requestedAt: row.requestedAt,
      completedAt: row.completedAt ?? undefined,
    },
    UniqueEntityId.create(row.id),
  );
}
