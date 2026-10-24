import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { MAX_UPLOAD_BYTES } from "@albumflow/contracts";
import { NotFoundError, ValidationError, type ApplicationError } from "#src/shared-kernel/errors";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { ObjectStorageWithBody } from "../../ports/object-storage";
import type { JobQueue } from "../../ports/job-queue";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";

const PHOTO_INTELLIGENCE_QUEUE = "photo-intelligence";
const MEDIA_QUEUE = "media-ingestion";
const STORAGE_QUEUE = "storage";

export interface ConfirmUploadCommand {
  photoId: string;
  reportedChecksum?: string | undefined;
  /** Whether the uploader opted into AI-assisted categorisation for this photo. */
  useAi?: boolean | undefined;
}

export interface ConfirmUploadResult {
  photoId: string;
  status: string;
  byteSize: number;
}

export class ConfirmUploadUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: ObjectStorageWithBody,
    private readonly jobs: JobQueue,
    /** Copy every uploaded original to long-term storage right after upload (LONG_TERM_ORIGINALS=all). */
    private readonly storeOriginalLongTerm = false,
    private readonly logger: Logger = consoleLogger,
  ) {}

  async execute(command: ConfirmUploadCommand): Promise<Result<ConfirmUploadResult, ApplicationError>> {
    const photoId = UniqueEntityId.create(command.photoId);
    const photo = await this.photos.findById(photoId);
    if (!photo) {
      return Result.failure(new NotFoundError("Photo", command.photoId));
    }

    const head = await this.storage.headObject(photo.storageKey.toString());
    if (!head) {
      return Result.failure(
        new ValidationError("No object was found at the presigned storage key yet — upload may still be in flight."),
      );
    }

    // The presigned PUT does not bind its length, so the size asked for is only a claim; what
    // actually landed is checked here, before anything decodes it or copies it to long-term storage.
    // Only while it is still pending: a photo confirmed before this check existed is part of a shoot.
    if (photo.status === "PENDING_UPLOAD" && head.byteSize > MAX_UPLOAD_BYTES) {
      await this.discardOversized(photo.id, photo.storageKey.toString(), head.byteSize);
      return Result.failure(new ValidationError("Files over 75MB are not accepted."));
    }

    photo.markUploaded({ byteSize: head.byteSize, checksum: command.reportedChecksum });
    photo.markAnalysisQueued();
    await this.photos.save(photo);

    // Display copies first: until they exist the editor has nothing to draw but
    // the original, and handing a browser a 20-megapixel file is what makes the
    // editor feel slow.
    await this.jobs.enqueue(MEDIA_QUEUE, "generate-derivatives", {
      photoId: photo.id.toString(),
    });

    await this.jobs.enqueue(PHOTO_INTELLIGENCE_QUEUE, "analyze-photo", {
      photoId: photo.id.toString(),
      projectId: photo.projectId.toString(),
      storageKey: photo.storageKey.toString(),
      mimeType: photo.mimeType,
      useAi: command.useAi ?? false,
    });

    // The fast path of "every photo goes to long-term storage". Best effort: the upload
    // is already safe in staging, and a periodic sweep retries anything this misses.
    if (this.storeOriginalLongTerm) {
      try {
        await this.jobs.enqueue(STORAGE_QUEUE, "store-original", { photoId: photo.id.toString() });
      } catch (error) {
        this.logger.warn("could not queue the long-term copy of an upload", {
          photoId: photo.id.toString(),
          err: error,
        });
      }
    }

    return Result.success({
      photoId: photo.id.toString(),
      status: photo.status,
      byteSize: photo.byteSize,
    });
  }

  /** Still PENDING_UPLOAD, so nothing refers to it yet: the row and the object both go, as for a cancelled upload. */
  private async discardOversized(photoId: UniqueEntityId, key: string, byteSize: number): Promise<void> {
    this.logger.warn("rejected an upload larger than the limit", { photoId: photoId.toString(), byteSize });
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn("could not delete a rejected upload's object", { photoId: photoId.toString(), err: error });
    }
    await this.photos.delete(photoId);
  }
}
