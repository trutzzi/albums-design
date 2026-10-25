import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ShootAlbums } from "../ports/shoot-albums";
import type { PickSession } from "../../domain/pick-session";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import type { ReviewSession } from "../../domain/review-session";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";
import type { DownloadSession } from "../../domain/download-session";
import type { DownloadSessionRepository } from "../../domain/download-session-repository";
import type { SlideshowSession } from "../../domain/slideshow-session";
import type { SlideshowSessionRepository } from "../../domain/slideshow-session-repository";

export type ActivityKind =
  | "albumCreated"
  | "pickCreated"
  | "pickSent"
  | "picksSubmitted"
  | "reviewSent"
  | "reviewNotes"
  | "reviewApproved"
  | "downloadCreated"
  | "downloadFirst"
  | "downloadLatest"
  | "slideshowCreated"
  | "slideshowWatched";

export interface ActivityEvent {
  kind: ActivityKind;
  at: string;
  /** Who it was about — the client named on the link — when there is one. */
  name: string | null;
  /** How many: photos picked, notes left, downloads, views. */
  count: number | null;
}

/** Enough to see what happened lately without turning the sidebar into a log. */
export const ACTIVITY_LIMIT = 12;

/**
 * A shoot's history, read from timestamps its albums and client links already keep — nothing
 * is recorded twice, so the timeline can never disagree with the rest of the page. Newest first.
 */
export function buildShootActivity(
  input: {
    albums: { createdAt: Date }[];
    picks: PickSession[];
    reviews: ReviewSession[];
    downloads: DownloadSession[];
    slideshows: SlideshowSession[];
  },
  limit = ACTIVITY_LIMIT,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const add = (kind: ActivityKind, at: Date | undefined, name: string | null = null, count: number | null = null) => {
    if (at) events.push({ kind, at: at.toISOString(), name, count });
  };

  for (const album of input.albums) add("albumCreated", album.createdAt);
  for (const pick of input.picks) {
    add("pickCreated", pick.createdAt, pick.clientName);
    add("pickSent", pick.lastSentAt, pick.clientName);
    add("picksSubmitted", pick.submittedAt, pick.clientName, pick.pickedPhotoIds.length);
  }
  for (const review of input.reviews) {
    add("reviewSent", review.lastSentAt, review.clientName);
    // A busy review would flood the timeline note by note; one line says how many, as of the latest.
    const latest = review.comments.reduce<Date | undefined>(
      (last, comment) => (!last || comment.createdAt > last ? comment.createdAt : last),
      undefined,
    );
    add("reviewNotes", latest, review.clientName, review.comments.length);
    add("reviewApproved", review.approvedAt, review.clientName);
  }
  for (const download of input.downloads) {
    add("downloadCreated", download.createdAt, download.clientName);
    add("downloadFirst", download.firstDownloadedAt, download.clientName);
    // Only worth its own line once there has been more than the first.
    if (download.downloadCount > 1)
      add("downloadLatest", download.lastDownloadedAt, download.clientName, download.downloadCount);
  }
  for (const slideshow of input.slideshows) {
    add("slideshowCreated", slideshow.createdAt, slideshow.clientName);
    add("slideshowWatched", slideshow.lastViewedAt, slideshow.clientName, slideshow.viewCount);
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** The shoot page's activity sidebar. Every source is read at once. */
export class ShootActivityUseCase {
  constructor(
    private readonly albums: ShootAlbums,
    private readonly picks: Pick<PickSessionRepository, "findByProjectId">,
    private readonly reviews: Pick<ReviewSessionRepository, "findByAlbumId">,
    private readonly downloads: Pick<DownloadSessionRepository, "findByProjectId">,
    private readonly slideshows: Pick<SlideshowSessionRepository, "findByProjectId">,
  ) {}

  async execute(projectId: string): Promise<ActivityEvent[]> {
    const id = UniqueEntityId.create(projectId);
    const [albums, picks, downloads, slideshows] = await Promise.all([
      this.albums.forProject(projectId),
      this.picks.findByProjectId(id),
      this.downloads.findByProjectId(id),
      this.slideshows.findByProjectId(id),
    ]);
    // A shoot has one album, sometimes two: one quick query each, side by side.
    const reviews = (
      await Promise.all(albums.map((album) => this.reviews.findByAlbumId(UniqueEntityId.create(album.id))))
    ).flat();
    return buildShootActivity({ albums, picks, reviews, downloads, slideshows });
  }
}
