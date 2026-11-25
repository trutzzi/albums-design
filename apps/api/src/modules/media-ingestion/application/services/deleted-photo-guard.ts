import { UniqueEntityId } from "@albumflow/domain-kernel";
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
 */
export class DeletedPhotoGuard {
  constructor(private readonly photos: PhotoRepository) {}

  async run<T>(photoId: string, work: () => Promise<T>): Promise<T | SkippedPhotoJob> {
    if (!(await this.exists(photoId))) return { photoId, skipped: "photo deleted" };
    try {
      return await work();
    } catch (error) {
      if (!(await this.exists(photoId))) return { photoId, skipped: "photo deleted" };
      throw error;
    }
  }

  private async exists(photoId: string): Promise<boolean> {
    return (await this.photos.findById(UniqueEntityId.create(photoId))) !== undefined;
  }
}
