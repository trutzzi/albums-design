import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, ValidationError, type ApplicationError } from "../../../../../shared-kernel/errors";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { ObjectStorage } from "../../ports/object-storage";
import type { JobQueue } from "../../ports/job-queue";

const PHOTO_INTELLIGENCE_QUEUE = "photo-intelligence";

export interface ConfirmUploadCommand {
  photoId: string;
  reportedChecksum?: string | undefined;
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

    await this.jobs.enqueue(PHOTO_INTELLIGENCE_QUEUE, "analyze-photo", {
      photoId: photo.id.toString(),
      projectId: photo.projectId.toString(),
      storageKey: photo.storageKey.toString(),
      mimeType: photo.mimeType,
    });

    return Result.success({
      photoId: photo.id.toString(),
      status: photo.status,
      byteSize: photo.byteSize,
    });
  }
}
