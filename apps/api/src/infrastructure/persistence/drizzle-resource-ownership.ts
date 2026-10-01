import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { photos, projects } from "../../modules/media-ingestion/infrastructure/persistence/schema";
import { albums } from "../../modules/album-composition/infrastructure/persistence/schema";
import { exportJobs } from "../../modules/export-print/infrastructure/persistence/schema";
import type { ResourceOwnership } from "../../interface/tenancy";

/**
 * The tenancy guard runs on nearly every studio request, so each answer is one indexed
 * query — an export job reaches its studio through album and project in a single join
 * instead of three round trips. Reads only the owning studio's id, never whole rows.
 */
export class DrizzleResourceOwnership implements ResourceOwnership {
  constructor(private readonly db: Database) {}

  async studioOfProject(projectId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ studioId: projects.studioId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return row?.studioId ?? null;
  }

  async studioOfPhoto(photoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ studioId: projects.studioId })
      .from(photos)
      .innerJoin(projects, eq(projects.id, photos.projectId))
      .where(eq(photos.id, photoId))
      .limit(1);
    return row?.studioId ?? null;
  }

  async studioOfAlbum(albumId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ studioId: projects.studioId })
      .from(albums)
      .innerJoin(projects, eq(projects.id, albums.projectId))
      .where(eq(albums.id, albumId))
      .limit(1);
    return row?.studioId ?? null;
  }

  async studioOfExportJob(exportJobId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ studioId: projects.studioId })
      .from(exportJobs)
      .innerJoin(albums, eq(albums.id, exportJobs.albumId))
      .innerJoin(projects, eq(projects.id, albums.projectId))
      .where(eq(exportJobs.id, exportJobId))
      .limit(1);
    return row?.studioId ?? null;
  }
}
