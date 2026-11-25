import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Photo } from "#src/modules/media-ingestion/domain/photo";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";

/** What a skipped job reports instead of its usual result. A type, so it fits a log context. */
export type SkippedPhotoJob = {
  photoId: string;
  skipped: "photo deleted";
};

/**
 * Deleting a shoot leaves its photos' preview and analysis jobs in the queue. Each then
 * failed ("Photo was not found", "NoSuchKey"), was retried three times and landed in the
 * admin Errors tab: about 2,100 errors in a week, none of them a real problem, burying
 * the ones that were. A job for a photo that no longer exists has nothing to do, so it
 * finishes quietly instead, whether the photo was gone before the job started or
 * disappeared while it ran.
 *
 * A job that was mid-run when its shoot was deleted may still have written display copies
 * after the shoot's files were removed; `removeLeftovers` deletes them, so nothing is left
 * behind that no row points to.
 */
export class DeletedPhotoGuard {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly removeLeftovers: (photo: Photo) => Promise<void> = async () => {},
  ) {}

  async run<T>(photoId: string, work: () => Promise<T>): Promise<T | SkippedPhotoJob> {
    const photo = await this.photos.findById(UniqueEntityId.create(photoId));
    if (!photo) return { photoId, skipped: "photo deleted" };

    let result: T;
    try {
      result = await work();
    } catch (error) {
      // If the photo cannot even be looked up, the job's own error is the one worth keeping.
      const gone = await this.isGone(photoId).catch(() => false);
      if (!gone) throw error;
      await this.cleanUp(photo);
      return { photoId, skipped: "photo deleted" };
    }
    if (await this.isGone(photoId).catch(() => false)) {
      await this.cleanUp(photo);
      return { photoId, skipped: "photo deleted" };
    }
    return result;
  }

  private async isGone(photoId: string): Promise<boolean> {
    return (await this.photos.findById(UniqueEntityId.create(photoId))) === undefined;
  }

  /** Best effort: a leftover that cannot be removed now is no reason to fail the job. */
  private async cleanUp(photo: Photo): Promise<void> {
    await this.removeLeftovers(photo).catch(() => undefined);
  }
}
