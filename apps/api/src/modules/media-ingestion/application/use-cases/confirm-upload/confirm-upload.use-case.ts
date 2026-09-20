import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, ValidationError, type ApplicationError } from "../../../../../shared-kernel/errors";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { ObjectStorage } from "../../ports/object-storage";
import type { JobQueue } from "../../ports/job-queue";

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
    private readonly storage: ObjectStorage,
    private readonly jobs: JobQueue,
    /** Copy every uploaded original to long-term storage right after upload (LONG_TERM_ORIGINALS=all). */
    private readonly storeOriginalLongTerm = false,
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
        console.error(`[storage] could not queue the long-term copy of ${photo.id.toString()}: ${String(error)}`);
      }
    }

    return Result.success({
      photoId: photo.id.toString(),
      status: photo.status,
      byteSize: photo.byteSize,
    });
  }
}
