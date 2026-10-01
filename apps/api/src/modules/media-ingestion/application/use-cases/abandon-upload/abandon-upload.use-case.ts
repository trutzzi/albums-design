import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, type ApplicationError } from "#src/shared-kernel/errors";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { ObjectStorageWithBody } from "../../ports/object-storage";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";

/**
 * Throws away an upload that never finished — what a cancelled batch leaves behind.
 *
 * Only a photo still waiting for its upload to be confirmed can be abandoned. Once a photo
 * is confirmed it is a real photo of the shoot, and losing it to a mistimed cancel would be
 * far worse than leaving a row behind, so this refuses rather than deletes.
 *
 * Idempotent: a photo that is already gone is a success, because a client retrying its
 * cleanup must not be told something is wrong.
 */
export class AbandonUploadUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: ObjectStorageWithBody,
    private readonly logger: Logger = consoleLogger,
  ) {}

  async execute(command: { photoId: string }): Promise<Result<void, ApplicationError>> {
    const id = UniqueEntityId.create(command.photoId);
    const photo = await this.photos.findById(id);
    if (!photo) return Result.success(undefined);

    if (photo.status !== "PENDING_UPLOAD") {
      return Result.failure(
        new ConflictError("This photo has already finished uploading, so it is part of the shoot now."),
      );
    }

    // The browser may have written some or all of the object before it was cut off.
    // Best effort: a storage hiccup must not leave the row behind as well.
    try {
      await this.storage.delete(photo.storageKey.toString());
    } catch (error) {
      // Not fatal — the row is what makes the photo visible anywhere — but it leaves an orphaned object.
      this.logger.warn("could not delete an abandoned upload's object", { photoId: command.photoId, err: error });
    }
    await this.photos.delete(id);
    return Result.success(undefined);
  }
}
