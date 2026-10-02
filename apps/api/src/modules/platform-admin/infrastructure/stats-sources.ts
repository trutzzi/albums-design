import { sql } from "drizzle-orm";
import type { Database } from "#src/db/client";
import { albums, exportJobs, pickSessions, projects, reviewSessions, studios, subscriptions } from "#src/db/schema";
import type { StatsInput } from "../domain/business-stats";
import { dayKey } from "../domain/business-stats";
import type { StatsSource } from "../application/ports/stats-source";
import type { PlanCode } from "../../identity/domain/plan";

/**
 * Reads the facts with a handful of narrow selects. Everything but photos is small (one
 * row per studio, shoot, album or link); photos are grouped by shoot and day in SQL.
 */
export class DrizzleStatsSource implements StatsSource {
  constructor(private readonly db: Database) {}

  async load(): Promise<StatsInput> {
    const [studioRows, subscriptionRows, projectRows, photoRows, albumRows, reviewRows, pickRows, exportRows] =
      await Promise.all([
        this.db.select({ id: studios.id, createdAt: studios.createdAt }).from(studios),
        this.db
          .select({ studioId: subscriptions.studioId, planCode: subscriptions.planCode, status: subscriptions.status })
          .from(subscriptions),
        this.db.select({ id: projects.id, studioId: projects.studioId, createdAt: projects.createdAt }).from(projects),
        this.db.execute<{ project_id: string; day: string; count: string }>(
          sql`select project_id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*) as count
              from photos group by project_id, day`,
        ),
        this.db
          .select({ id: albums.id, projectId: albums.projectId, status: albums.status, createdAt: albums.createdAt })
          .from(albums),
        this.db
          .select({
            albumId: reviewSessions.albumId,
            status: reviewSessions.status,
            createdAt: reviewSessions.createdAt,
          })
          .from(reviewSessions),
        this.db.select({ projectId: pickSessions.projectId, status: pickSessions.status }).from(pickSessions),
        this.db
          .select({ albumId: exportJobs.albumId, status: exportJobs.status, requestedAt: exportJobs.requestedAt })
          .from(exportJobs),
      ]);
    return {
      studios: studioRows,
      subscriptions: subscriptionRows.map((row) => ({ ...row, planCode: row.planCode as PlanCode })),
      projects: projectRows,
      photoDays: [...photoRows].map((row) => ({ projectId: row.project_id, day: row.day, count: Number(row.count) })),
      albums: albumRows,
      reviews: reviewRows,
      picks: pickRows,
      exports: exportRows,
    };
  }
}

interface Keyed<T> {
  items: Map<string, T>;
}

/** Demo mode: the same facts, read straight from the in-memory repositories. */
export class InMemoryStatsSource implements StatsSource {
  constructor(
    private readonly repos: {
      studios: Keyed<{ id: { toString(): string }; createdAt: Date }>;
      subscriptions: Keyed<{ studioId: { toString(): string }; planCode: PlanCode; status: string }>;
      projects: Keyed<{ id: { toString(): string }; studioId: { toString(): string }; createdAt: Date }>;
      photos: Keyed<{ projectId: { toString(): string }; createdAt: Date }>;
      albums: Keyed<{ id: { toString(): string }; projectId: { toString(): string }; status: string; createdAt: Date }>;
      reviews: Keyed<{ albumId: { toString(): string }; status: string; createdAt: Date }>;
      picks: Keyed<{ projectId: { toString(): string }; status: string }>;
      exports: Keyed<{ albumId: { toString(): string }; status: string; requestedAt: Date }>;
    },
  ) {}

  async load(): Promise<StatsInput> {
    const values = <T>(repo: Keyed<T>) => [...repo.items.values()];
    const photoDays = new Map<string, { projectId: string; day: string; count: number }>();
    for (const photo of values(this.repos.photos)) {
      const projectId = photo.projectId.toString();
      const day = dayKey(photo.createdAt);
      const key = `${projectId}|${day}`;
      const entry = photoDays.get(key) ?? { projectId, day, count: 0 };
      entry.count += 1;
      photoDays.set(key, entry);
    }
    return {
      studios: values(this.repos.studios).map((studio) => ({ id: studio.id.toString(), createdAt: studio.createdAt })),
      subscriptions: values(this.repos.subscriptions).map((sub) => ({
        studioId: sub.studioId.toString(),
        planCode: sub.planCode,
        status: sub.status,
      })),
      projects: values(this.repos.projects).map((project) => ({
        id: project.id.toString(),
        studioId: project.studioId.toString(),
        createdAt: project.createdAt,
      })),
      photoDays: [...photoDays.values()],
      albums: values(this.repos.albums).map((album) => ({
        id: album.id.toString(),
        projectId: album.projectId.toString(),
        status: album.status,
        createdAt: album.createdAt,
      })),
      reviews: values(this.repos.reviews).map((review) => ({
        albumId: review.albumId.toString(),
        status: review.status,
        createdAt: review.createdAt,
      })),
      picks: values(this.repos.picks).map((pick) => ({ projectId: pick.projectId.toString(), status: pick.status })),
      exports: values(this.repos.exports).map((job) => ({
        albumId: job.albumId.toString(),
        status: job.status,
        requestedAt: job.requestedAt,
      })),
    };
  }
}
