import type { ProjectSummaryDTO } from "@albumflow/contracts";
import { SHOOT_STEPS, shootWorkflow, type ShootWorkflow } from "./shoot-workflow";

type Progress = NonNullable<ProjectSummaryDTO["progress"]>;
const NO_PROGRESS: Progress = { albums: [], picks: [], reviews: [], deliveries: [] };

/** A download link ending within this many days, not yet used, is worth a reminder. */
export const EXPIRING_DAYS = 3;

/** The shoot page's own workflow, worked out from a list card — so the two never disagree. */
export function workflowOf(shoot: ProjectSummaryDTO): ShootWorkflow {
  const progress = shoot.progress ?? NO_PROGRESS;
  return shootWorkflow({
    uploaded: shoot.photoCount,
    analysed: shoot.photoCount - shoot.processingCount,
    albums: progress.albums,
    picks: progress.picks.map(({ status, clientName }) => ({ status, clientName })),
    deliveries: progress.deliveries,
  });
}

/** One segment per workflow step, filled when that step is done: the bar on each card. */
export function stepsDone(shoot: ProjectSummaryDTO): boolean[] {
  const { steps } = workflowOf(shoot);
  return SHOOT_STEPS.map((step) => steps[step].done);
}

export type Attention =
  | { kind: "changes"; count: number; albumId: string }
  | { kind: "picks"; name: string; count: number }
  | { kind: "deliver" }
  | { kind: "expiring"; days: number };

/**
 * The one thing about a shoot that is waiting on the photographer, most urgent first: the
 * client asked for changes, sent their picks with no album yet, approved an album that has
 * not been delivered, or has a download link about to end unused. `null` when nothing waits.
 */
export function attentionFor(shoot: ProjectSummaryDTO): Attention | null {
  const progress = shoot.progress ?? NO_PROGRESS;
  const changes = progress.reviews.find((review) => review.status === "CHANGES_REQUESTED" && review.openComments > 0);
  // The album the notes are on — a shoot can have more than one.
  if (changes) return { kind: "changes", count: changes.openComments, albumId: changes.albumId };

  const sent = progress.picks.find((pick) => pick.status === "SUBMITTED");
  if (sent && progress.albums.length === 0) return { kind: "picks", name: sent.clientName, count: sent.pickedCount };

  const approved = progress.albums.some((album) => album.status === "APPROVED" || album.status === "EXPORTED");
  const delivering = progress.deliveries.some((link) => link.status === "ACTIVE" || link.downloadCount > 0);
  if (approved && !delivering) return { kind: "deliver" };

  const ending = progress.deliveries.find(
    (link) => link.status === "ACTIVE" && link.downloadCount === 0 && link.daysLeft <= EXPIRING_DAYS,
  );
  if (ending) return { kind: "expiring", days: ending.daysLeft };
  return null;
}

export type ShootFilter = "all" | "needs" | "client" | "delivered";

/** Which tab a shoot belongs to besides "All": waiting on the photographer, on the client, or done. */
export function filterOf(shoot: ProjectSummaryDTO): Exclude<ShootFilter, "all"> | null {
  if (attentionFor(shoot)) return "needs";
  const progress = shoot.progress ?? NO_PROGRESS;
  if (progress.deliveries.some((link) => link.downloadCount > 0)) return "delivered";
  const withClient =
    progress.picks.some((pick) => pick.status === "OPEN") ||
    progress.reviews.some((review) => review.status === "OPEN");
  return withClient ? "client" : null;
}

export function matchesFilter(shoot: ProjectSummaryDTO, filter: ShootFilter): boolean {
  return filter === "all" || filterOf(shoot) === filter;
}

/** How many shoots each tab holds. */
export function filterCounts(shoots: readonly ProjectSummaryDTO[]): Record<ShootFilter, number> {
  const counts: Record<ShootFilter, number> = { all: shoots.length, needs: 0, client: 0, delivered: 0 };
  for (const shoot of shoots) {
    const filter = filterOf(shoot);
    if (filter) counts[filter] += 1;
  }
  return counts;
}

/** "Good morning" before noon, "Good afternoon" until six, then "Good evening". */
export function greetingKey(
  now: Date,
): "projects.greeting.morning" | "projects.greeting.afternoon" | "projects.greeting.evening" {
  const hour = now.getHours();
  return hour < 12
    ? "projects.greeting.morning"
    : hour < 18
      ? "projects.greeting.afternoon"
      : "projects.greeting.evening";
}
