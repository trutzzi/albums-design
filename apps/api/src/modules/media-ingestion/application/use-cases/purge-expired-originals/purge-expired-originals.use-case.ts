import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { ProjectRepository } from "../../../domain/project-repository";
import type { DeliveryDirectory } from "../../ports/delivery-directory";
import type { AlbumPlacementDirectory } from "../../ports/album-placements";
import type { ClientPickDirectory } from "../../ports/client-picks";
import type { DownloadHoldDirectory } from "../../ports/download-holds";
import type { ObjectStorageWithBody } from "../../ports/object-storage";
import type { PromoteSelectedPhotosUseCase } from "../promote-selected/promote-selected.use-case";
import type { StoreOriginalUseCase } from "../store-original/store-original.use-case";

export interface PurgeSummary {
  projectsSwept: number;
  purged: number;
  /** Placed photos that could not be confirmed on long-term storage, so were kept. */
  heldBack: number;
  /** Shoots skipped entirely because a client download link is still active. */
  projectsOnHold: number;
}

/**
 * Retention: `retentionDays` after a shoot's latest export completes, delete the
 * staged full-resolution originals. Previews and thumbnails live on long-term
 * storage and are untouched.
 *
 * The rule that keeps this from ever destroying the only copy: a photo is deleted
 * from staging only if it is *not placed on any album*, or it is placed and
 * verifiably stored long-term (a client's submitted picks count as placed). Placed photos are promoted here first, so a shoot
 * that was exported without ever being approved (no promotion trigger fired)
 * still has its album photos saved before the sweep can touch anything.
 */
export class PurgeExpiredOriginalsUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly photos: PhotoRepository,
    private readonly staging: ObjectStorageWithBody,
    private readonly deliveries: DeliveryDirectory,
    private readonly placements: AlbumPlacementDirectory,
    private readonly promoter: PromoteSelectedPhotosUseCase,
    private readonly retentionDays: number,
    private readonly now: () => Date = () => new Date(),
    private readonly picks?: ClientPickDirectory,
    private readonly downloadHolds?: DownloadHoldDirectory,
    /**
     * Present when every original is meant to live on long-term storage. Then the rule is
     * stricter than for placed photos alone: NO staged original is deleted unless it is
     * verifiably stored there, and one that is not yet is copied first.
     */
    private readonly storeEverything?: StoreOriginalUseCase,
  ) {}

  async execute(): Promise<PurgeSummary> {
    const now = this.now();
    const cutoff = new Date(now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000);
    const summary: PurgeSummary = { projectsSwept: 0, purged: 0, heldBack: 0, projectsOnHold: 0 };

    for (const projectId of await this.deliveries.projectsDeliveredBefore(cutoff)) {
      if (!(await this.projects.findById(UniqueEntityId.create(projectId)))) continue;

      // A client was told the photos are downloadable until the link expires; they stay until then.
      if (await this.downloadHolds?.hasActiveLink(projectId, now)) {
        summary.projectsOnHold++;
        continue;
      }

      // "Selected" is whatever the client submitted as picks or the album actually uses.
      const placed = new Set([
        ...(await this.placements.forProject(projectId)),
        ...((await this.picks?.forProject(projectId)) ?? []),
      ]);
      await this.promoter.promote(projectId, [...placed]);

      const photos = await this.photos.findByProjectId(UniqueEntityId.create(projectId));
      for (const photo of photos) {
        if (photo.status === "PENDING_UPLOAD" || photo.stagedOriginalPurgedAt) continue;

        // Without display copies the original is the only thing the gallery can show.
        const isPlaced = placed.has(photo.id.toString());
        if (!photo.hasDerivatives || (isPlaced && !photo.fullResStoredAt)) {
          summary.heldBack++;
          continue;
        }

        // Never the only copy: with everything meant to be stored long-term, an original that
        // is not there yet is copied now, and if that fails it stays in staging.
        if (this.storeEverything && !photo.fullResStoredAt) {
          const stored = await this.storeEverything.execute({ photoId: photo.id.toString() });
          if (stored.isFailure) {
            summary.heldBack++;
            continue;
          }
        }

        await this.staging.delete(photo.storageKey.toString());
        await this.photos.markStagedOriginalPurged(photo.id, now);
        summary.purged++;
      }
      summary.projectsSwept++;
    }
    return summary;
  }
}
