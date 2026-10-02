import { PLANS, monthlyPriceFor, type PlanCode } from "../../identity/domain/plan";

/**
 * The raw facts the business numbers are computed from — small, flat rows each source
 * can produce cheaply. Photos arrive pre-counted per shoot per day, because that table
 * is the one that grows into the millions.
 */
export interface StatsInput {
  studios: { id: string; createdAt: Date }[];
  subscriptions: { studioId: string; planCode: PlanCode; status: string }[];
  projects: { id: string; studioId: string; createdAt: Date }[];
  photoDays: { projectId: string; day: string; count: number }[];
  albums: { id: string; projectId: string; status: string; createdAt: Date }[];
  reviews: { albumId: string; status: string; createdAt: Date }[];
  picks: { projectId: string; status: string }[];
  exports: { albumId: string; status: string; requestedAt: Date }[];
}

export interface BusinessStats {
  generatedAt: string;
  studios: { total: number; new7d: number; new30d: number };
  /** Studios that made something — a shoot, an upload or an album — in the window. */
  activeStudios: { d7: number; d30: number };
  revenue: {
    mrrEur: number;
    payingStudios: number;
    /** Paying studios as a share of every studio that ever signed up. */
    trialToPaidPct: number;
    pastDue: number;
    cancelled: number;
    plans: { code: PlanCode; name: string; studios: number }[];
  };
  /** How far each studio has got, first step to last: where new signups stall. */
  funnel: { step: FunnelStep; studios: number }[];
  totals: {
    photos: number;
    albums: number;
    reviewLinks: number;
    approvedAlbums: number;
    clientPicksSubmitted: number;
    exportsReady: number;
    exportsFailed: number;
  };
  /** One entry per day for the last 30 days, oldest first. */
  daily: { day: string; signups: number; photos: number; albums: number }[];
}

export type FunnelStep =
  "signedUp" | "createdShoot" | "uploadedPhotos" | "builtAlbum" | "sentForReview" | "approved" | "exported";

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeBusinessStats(input: StatsInput, now: Date = new Date()): BusinessStats {
  const since = (days: number) => now.getTime() - days * DAY_MS;
  const within = (date: Date, days: number) => date.getTime() >= since(days);
  const dayWithin = (day: string, days: number) => Date.parse(`${day}T23:59:59Z`) >= since(days);

  const studioOfProject = new Map(input.projects.map((project) => [project.id, project.studioId]));
  const projectOfAlbum = new Map(input.albums.map((album) => [album.id, album.projectId]));
  const studioOfAlbum = (albumId: string) => studioOfProject.get(projectOfAlbum.get(albumId) ?? "");

  // --- activity ---------------------------------------------------------------
  const activeIn = (days: number) => {
    const active = new Set<string>();
    for (const project of input.projects) if (within(project.createdAt, days)) active.add(project.studioId);
    for (const album of input.albums) {
      const studio = studioOfProject.get(album.projectId);
      if (studio && within(album.createdAt, days)) active.add(studio);
    }
    for (const row of input.photoDays) {
      const studio = studioOfProject.get(row.projectId);
      if (studio && dayWithin(row.day, days)) active.add(studio);
    }
    return active.size;
  };

  // --- revenue ----------------------------------------------------------------
  const joined = new Map(input.studios.map((studio) => [studio.id, studio.createdAt]));
  const paying = input.subscriptions.filter((sub) => sub.planCode !== "TRIAL" && sub.status === "ACTIVE");
  const planCounts = new Map<PlanCode, number>();
  for (const sub of input.subscriptions) planCounts.set(sub.planCode, (planCounts.get(sub.planCode) ?? 0) + 1);

  // --- funnel -----------------------------------------------------------------
  const distinct = (ids: (string | undefined)[]) => new Set(ids.filter((id): id is string => Boolean(id))).size;
  const approvedStatuses = new Set(["APPROVED", "EXPORTED"]);
  const funnel: BusinessStats["funnel"] = [
    { step: "signedUp", studios: input.studios.length },
    { step: "createdShoot", studios: distinct(input.projects.map((project) => project.studioId)) },
    {
      step: "uploadedPhotos",
      studios: distinct(
        input.photoDays.filter((row) => row.count > 0).map((row) => studioOfProject.get(row.projectId)),
      ),
    },
    { step: "builtAlbum", studios: distinct(input.albums.map((album) => studioOfProject.get(album.projectId))) },
    { step: "sentForReview", studios: distinct(input.reviews.map((review) => studioOfAlbum(review.albumId))) },
    {
      step: "approved",
      studios: distinct(
        input.albums
          .filter((album) => approvedStatuses.has(album.status))
          .map((album) => studioOfProject.get(album.projectId)),
      ),
    },
    {
      step: "exported",
      studios: distinct(input.exports.filter((job) => job.status === "READY").map((job) => studioOfAlbum(job.albumId))),
    },
  ];

  // --- last 30 days, day by day ----------------------------------------------
  const daily = new Map<string, { day: string; signups: number; photos: number; albums: number }>();
  for (let offset = 29; offset >= 0; offset--) {
    const day = dayKey(new Date(now.getTime() - offset * DAY_MS));
    daily.set(day, { day, signups: 0, photos: 0, albums: 0 });
  }
  for (const studio of input.studios) {
    const entry = daily.get(dayKey(studio.createdAt));
    if (entry) entry.signups += 1;
  }
  for (const album of input.albums) {
    const entry = daily.get(dayKey(album.createdAt));
    if (entry) entry.albums += 1;
  }
  for (const row of input.photoDays) {
    const entry = daily.get(row.day);
    if (entry) entry.photos += row.count;
  }

  const total = input.studios.length;
  return {
    generatedAt: now.toISOString(),
    studios: {
      total,
      new7d: input.studios.filter((studio) => within(studio.createdAt, 7)).length,
      new30d: input.studios.filter((studio) => within(studio.createdAt, 30)).length,
    },
    activeStudios: { d7: activeIn(7), d30: activeIn(30) },
    revenue: {
      // Each studio at what it actually pays: early studios keep their launch price.
      mrrEur: paying.reduce(
        (sum, sub) => sum + monthlyPriceFor(PLANS[sub.planCode], joined.get(sub.studioId) ?? now),
        0,
      ),
      payingStudios: paying.length,
      trialToPaidPct: total === 0 ? 0 : Math.round((paying.length / total) * 1000) / 10,
      pastDue: input.subscriptions.filter((sub) => sub.status === "PAST_DUE").length,
      cancelled: input.subscriptions.filter((sub) => sub.status === "CANCELLED").length,
      plans: (Object.keys(PLANS) as PlanCode[]).map((code) => ({
        code,
        name: PLANS[code].name,
        studios: planCounts.get(code) ?? 0,
      })),
    },
    funnel,
    totals: {
      photos: input.photoDays.reduce((sum, row) => sum + row.count, 0),
      albums: input.albums.length,
      reviewLinks: input.reviews.length,
      approvedAlbums: input.albums.filter((album) => approvedStatuses.has(album.status)).length,
      clientPicksSubmitted: input.picks.filter((pick) => pick.status === "SUBMITTED").length,
      exportsReady: input.exports.filter((job) => job.status === "READY").length,
      exportsFailed: input.exports.filter((job) => job.status === "FAILED").length,
    },
    daily: [...daily.values()],
  };
}
