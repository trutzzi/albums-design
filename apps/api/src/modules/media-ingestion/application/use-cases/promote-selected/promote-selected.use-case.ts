import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, type ApplicationError } from "../../../../../shared-kernel/errors";
import type { StorageProvider } from "../../../../../shared-kernel/storage-provider";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { AlbumPlacementDirectory } from "../../ports/album-placements";
import type { ClientPickDirectory } from "../../ports/client-picks";
import type { ObjectStorageWithBody } from "../../ports/object-storage";

export interface PromotionSummary {
  promoted: number;
  alreadyStored: number;
  /** Ids that were not photos of this project at all. */
  skipped: number;
  failed: { photoId: string; reason: string }[];
}

/**
 * Second tier of the upload pipeline. Originals are held in the staging bucket
 * until it is known which photos were chosen; this copies exactly those to
 * long-term storage, at the same key, and never touches the rest.
 *
 * Idempotent and safe to retry: a photo already stored at the right size is
 * skipped, one whose upload was interrupted is simply uploaded again, and one
 * failing does not stop the others — the caller gets a failure only after the
 * whole set was attempted, so BullMQ's retry re-does just what is left.
 */
export class PromoteSelectedPhotosUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly staging: ObjectStorageWithBody,
    private readonly permanent: StorageProvider,
    private readonly placements: AlbumPlacementDirectory,
    private readonly now: () => Date = () => new Date(),
    private readonly picks?: ClientPickDirectory,
  ) {}

  /** Triggered when an album is approved: promotes what is placed on that album. */
  async execute(command: { albumId: string }): Promise<Result<PromotionSummary, ApplicationError>> {
    const album = await this.placements.forAlbum(command.albumId);
    if (!album) return Result.failure(new NotFoundError("Album", command.albumId));

    const summary = await this.promote(album.projectId, album.photoIds);
    if (summary.failed.length > 0) {
      return Result.failure(
        new ConflictError(
          `${summary.failed.length} selected photo(s) could not be stored long-term: ` +
            summary.failed.map((failure) => `${failure.photoId} (${failure.reason})`).join("; "),
        ),
      );
    }
    return Result.success(summary);
  }

  /** Triggered when a client submits their picks: promotes what they chose from the whole shoot. */
  async executePicked(command: { projectId: string }): Promise<Result<PromotionSummary, ApplicationError>> {
    const photoIds = (await this.picks?.forProject(command.projectId)) ?? [];
    const summary = await this.promote(command.projectId, photoIds);
    if (summary.failed.length > 0) {
      return Result.failure(
        new ConflictError(
          `${summary.failed.length} picked photo(s) could not be stored long-term: ` +
            summary.failed.map((failure) => `${failure.photoId} (${failure.reason})`).join("; "),
        ),
      );
    }
    return Result.success(summary);
  }

  /** Also used by the retention sweep, which must never purge a placed photo before it is safely stored. */
  async promote(projectId: string, photoIds: string[]): Promise<PromotionSummary> {
    const summary: PromotionSummary = { promoted: 0, alreadyStored: 0, skipped: 0, failed: [] };
    const owned = [];
    for (const id of new Set(photoIds.filter(Boolean))) {
      const photo = await this.photos.findById(UniqueEntityId.create(id));
      // An album can only place its own project's photos; anything else is not ours to copy.
      if (!photo || photo.projectId.toString() !== projectId) summary.skipped++;
      else owned.push(photo);
    }

    // Recorded before any copying: retention treats "selected but not yet stored"
    // as held, so a slow or failed promotion can never turn into a purge.
    await this.photos.markSelected(owned.map((photo) => photo.id), this.now());

    for (const photo of owned) {
      try {
        const key = photo.storageKey.toString();
        const stored = await this.permanent.head(key);
        if (stored && stored.size === photo.byteSize) {
          if (!photo.fullResStoredAt) await this.photos.markFullResStored(photo.id, this.now());
          summary.alreadyStored++;
          continue;
        }

        if (!(await this.staging.headObject(key))) {
          summary.failed.push({ photoId: photo.id.toString(), reason: "original is no longer staged" });
          continue;
        }
        const body = await this.staging.getObject(key);
        await this.permanent.upload(key, body, { contentType: photo.mimeType });

        const verified = await this.permanent.head(key);
        if (verified?.size !== body.byteLength) {
          throw new Error(`stored ${verified?.size ?? 0} of ${body.byteLength} bytes`);
        }
        await this.photos.markFullResStored(photo.id, this.now());
        summary.promoted++;
      } catch (error) {
        summary.failed.push({
          photoId: photo.id.toString(),
          reason: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
    return summary;
  }
}
