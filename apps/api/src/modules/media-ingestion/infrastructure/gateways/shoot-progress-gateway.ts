import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "#src/modules/album-composition/domain/album-repository";
import type { PickSessionRepository } from "#src/modules/review-collaboration/domain/pick-session-repository";
import type { DownloadSessionRepository } from "#src/modules/review-collaboration/domain/download-session-repository";
import type { ReviewSessionRepository } from "#src/modules/review-collaboration/domain/review-session-repository";
import type { ShootProgress, ShootProgressDirectory } from "../../application/ports/shoot-progress";

/**
 * Reads every shoot's albums and client links in four batched queries — albums, selection
 * links and download links by shoot, review links by album — however many shoots there are.
 */
export class ReviewCollaborationShootProgress implements ShootProgressDirectory {
  constructor(
    private readonly albums: Pick<AlbumRepository, "statusesByProjectIds">,
    private readonly picks: Pick<PickSessionRepository, "progressByProjectIds">,
    private readonly downloads: Pick<DownloadSessionRepository, "findByProjectIds">,
    private readonly reviews: Pick<ReviewSessionRepository, "progressByAlbumIds">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async forProjects(projectIds: string[]): Promise<Map<string, ShootProgress>> {
    const progress = new Map<string, ShootProgress>(
      projectIds.map((id) => [id, { albums: [], picks: [], reviews: [], deliveries: [] }]),
    );
    if (projectIds.length === 0) return progress;
    const ids = projectIds.map((id) => UniqueEntityId.create(id));
    const [albums, picks, downloads] = await Promise.all([
      this.albums.statusesByProjectIds(ids),
      this.picks.progressByProjectIds(ids),
      this.downloads.findByProjectIds(ids),
    ]);
    const reviews = await this.reviews.progressByAlbumIds(albums.map((album) => UniqueEntityId.create(album.id)));
    const projectOfAlbum = new Map(albums.map((album) => [album.id, album.projectId]));
    const now = this.now();

    for (const album of albums) progress.get(album.projectId)?.albums.push({ id: album.id, status: album.status });
    for (const pick of picks) {
      progress.get(pick.projectId)?.picks.push({
        status: pick.status,
        clientName: pick.clientName,
        pickedCount: pick.pickedCount,
        submittedAt: pick.submittedAt?.toISOString() ?? null,
      });
    }
    for (const review of reviews) {
      const projectId = projectOfAlbum.get(review.albumId);
      progress
        .get(projectId ?? "")
        ?.reviews.push({ albumId: review.albumId, status: review.status, openComments: review.openComments });
    }
    for (const download of downloads) {
      progress.get(download.projectId.toString())?.deliveries.push({
        // Expiry is a matter of time, never stored — the same rule the studio's link list uses.
        status: download.status === "REVOKED" ? "REVOKED" : download.isExpired(now) ? "EXPIRED" : "ACTIVE",
        downloadCount: download.downloadCount,
        daysLeft: download.daysLeft(now),
      });
    }
    return progress;
  }
}
