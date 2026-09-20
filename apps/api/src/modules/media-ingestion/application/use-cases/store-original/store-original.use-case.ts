import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, type ApplicationError } from "../../../../../shared-kernel/errors";
import type { StorageProvider } from "../../../../../shared-kernel/storage-provider";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { ObjectStorageWithBody } from "../../ports/object-storage";

/** What happened to one photo's original. Every outcome except a thrown error means "nothing more to do". */
export type StoreOutcome = "stored" | "already-stored" | "skipped";

/**
 * Copies one photo's full-resolution original from the staging bucket to
 * long-term storage, at the same key. This is what "every photo goes to
 * DigiStorage" means: the browser can only upload to the staging bucket
 * (WebDAV has no presigned URLs), so a server-side copy follows each upload.
 *
 * Built to be run any number of times: a photo already stored at the right size
 * is left alone, one whose earlier upload was cut short is simply uploaded
 * again, and the result is verified by size before the photo is marked stored —
 * so "stored" always means "really there", which is what lets retention delete
 * the staged copy later without ever destroying the only one.
 */
export class StoreOriginalUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly staging: ObjectStorageWithBody,
    private readonly permanent: StorageProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: { photoId: string }): Promise<Result<StoreOutcome, ApplicationError>> {
    const photo = await this.photos.findById(UniqueEntityId.create(command.photoId));
    // Deleted, or the upload never finished: there is no original to copy, and retrying will not create one.
    if (!photo || photo.status === "PENDING_UPLOAD") return Result.success("skipped");

    const key = photo.storageKey.toString();
    try {
      const existing = await this.permanent.head(key);
      if (existing && existing.size === photo.byteSize) {
        if (!photo.fullResStoredAt) await this.photos.markFullResStored(photo.id, this.now());
        return Result.success("already-stored");
      }

      if (!(await this.staging.headObject(key))) {
        return Result.failure(new ConflictError(`the original of ${photo.fileName} is no longer staged and is not on long-term storage`));
      }
      const body = await this.staging.getObject(key);
      await this.permanent.upload(key, body, { contentType: photo.mimeType });

      const verified = await this.permanent.head(key);
      if (verified?.size !== body.byteLength) {
        throw new Error(`stored ${verified?.size ?? 0} of ${body.byteLength} bytes`);
      }
      await this.photos.markFullResStored(photo.id, this.now());
      return Result.success("stored");
    } catch (error) {
      return Result.failure(
        new ConflictError(
          `could not store ${photo.fileName} long-term: ${error instanceof Error ? error.message : "unknown error"}`,
        ),
      );
    }
  }
}
