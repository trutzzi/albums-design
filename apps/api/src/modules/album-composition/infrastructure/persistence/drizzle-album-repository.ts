import { and, eq, gte, inArray } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import { projects } from "../../../media-ingestion/infrastructure/persistence/schema";
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
    const rows = await this.db
      .select()
      .from(albums)
      .where(eq(albums.projectId, projectId.toString()));
    return rows.map(toDomain);
  }

  async countCreatedSince(studioId: UniqueEntityId, since: Date): Promise<number> {
    const studioProjects = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.studioId, studioId.toString()));
    if (studioProjects.length === 0) return 0;

    const rows = await this.db
      .select({ id: albums.id })
      .from(albums)
      .where(
        and(
          inArray(
            albums.projectId,
            studioProjects.map((project) => project.id),
          ),
          gte(albums.createdAt, since),
        ),
      );
    return rows.length;
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    UniqueEntityId.create(row.id),
  );
}
