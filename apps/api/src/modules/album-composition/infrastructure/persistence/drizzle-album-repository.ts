import { and, count, eq, gte, inArray } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "#src/db/client";
import { projects } from "#src/modules/media-ingestion/infrastructure/persistence/schema";
import { DEFAULT_STYLE } from "@albumflow/contracts";
import { Album } from "../../domain/album";
import type { AlbumRepository } from "../../domain/album-repository";
import { albums } from "./schema";

export class DrizzleAlbumRepository implements AlbumRepository {
  constructor(private readonly db: Database) {}

  async save(album: Album): Promise<void> {
    const row = {
      id: album.id.toString(),
      projectId: album.projectId.toString(),
      title: album.title,
      status: album.status,
      format: album.format,
      spreads: [...album.spreads],
      style: album.style,
      cover: album.cover,
      spreadCount: album.spreadCount,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
    };
    await this.db
      .insert(albums)
      .values(row)
      .onConflictDoUpdate({
        target: albums.id,
        set: {
          title: row.title,
          status: row.status,
          format: row.format,
          spreads: row.spreads,
          style: row.style,
          cover: row.cover,
          spreadCount: row.spreadCount,
          updatedAt: row.updatedAt,
        },
      });
  }

  async findById(id: UniqueEntityId): Promise<Album | undefined> {
    const [row] = await this.db.select().from(albums).where(eq(albums.id, id.toString())).limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByProjectId(projectId: UniqueEntityId): Promise<Album[]> {
    const rows = await this.db.select().from(albums).where(eq(albums.projectId, projectId.toString()));
    return rows.map(toDomain);
  }

  async countByProjectIds(projectIds: UniqueEntityId[]): Promise<Record<string, number>> {
    if (projectIds.length === 0) return {};
    const rows = await this.db
      .select({ projectId: albums.projectId, total: count() })
      .from(albums)
      .where(
        inArray(
          albums.projectId,
          projectIds.map((id) => id.toString()),
        ),
      )
      .groupBy(albums.projectId);
    return Object.fromEntries(rows.map((row) => [row.projectId, Number(row.total)]));
  }

  async countCreatedSince(studioId: UniqueEntityId, since: Date): Promise<number> {
    // Counted in the database: no project ids or album rows travel back just to be counted.
    const [row] = await this.db
      .select({ total: count() })
      .from(albums)
      .innerJoin(projects, eq(projects.id, albums.projectId))
      .where(and(eq(projects.studioId, studioId.toString()), gte(albums.createdAt, since)));
    return Number(row?.total ?? 0);
  }

  async delete(id: UniqueEntityId): Promise<void> {
    await this.db.delete(albums).where(eq(albums.id, id.toString()));
  }
}

function toDomain(row: typeof albums.$inferSelect): Album {
  return Album.reconstitute(
    {
      projectId: UniqueEntityId.create(row.projectId),
      title: row.title,
      status: row.status,
      format: row.format,
      // Rows written before treatments existed have no field; default them on read.
      spreads: row.spreads.map((spread) => ({
        ...spread,
        placements: spread.placements.map((placement) => ({
          ...placement,
          treatment: placement.treatment ?? "COLOR",
        })),
      })),
      style: row.style ?? DEFAULT_STYLE,
      cover: row.cover ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    UniqueEntityId.create(row.id),
  );
}
