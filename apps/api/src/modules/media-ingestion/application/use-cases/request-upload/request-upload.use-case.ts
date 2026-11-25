import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ApplicationError, ConflictError, NotFoundError } from "#src/shared-kernel/errors";
import type { PlanFeatureDirectory } from "#src/shared-kernel/plan-features";
import type { ProjectRepository } from "#src/modules/media-ingestion/domain/project-repository";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import { Photo } from "#src/modules/media-ingestion/domain/photo";
import type { ObjectStorage } from "../../ports/object-storage";

const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface RequestUploadCommand {
  studioId: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}

export interface RequestUploadResult {
  photoId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

export class RequestUploadUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly photos: PhotoRepository,
    private readonly storage: ObjectStorage,
    private readonly planFeatures?: PlanFeatureDirectory,
  ) {}

  async execute(command: RequestUploadCommand): Promise<Result<RequestUploadResult, ApplicationError>> {
    const projectId = UniqueEntityId.create(command.projectId);
    const project = await this.projects.findById(projectId);
    if (!project) {
      return Result.failure(new NotFoundError("Project", command.projectId));
    }

    const studioId = UniqueEntityId.create(command.studioId);
    if (!project.studioId.equals(studioId)) {
      return Result.failure(new NotFoundError("Project", command.projectId));
    }

    const limit = (await this.planFeatures?.forProject(command.projectId))?.maxPhotosPerShoot ?? null;
    if (limit !== null) {
      // Uploads still in flight count too, or one large drop would slip past the limit
      // before any of it is confirmed. Only small plans have a limit, so the list is short.
      const existing = await this.photos.findByProjectId(projectId);
      if (existing.length >= limit) {
        return Result.failure(
          new ConflictError(
            `Your plan allows ${limit} photos per shoot. Contact us to move to the Studio plan for unlimited photos.`,
          ),
        );
      }
    }

    // The same file dropped twice (a folder uploaded again, a second tab) would make a second
    // copy of every photo, each analysed, stored and offered to the client. Same name and
    // same size in the same shoot is the same file for any camera export.
    const duplicate = await this.photos.findUploadedDuplicate(projectId, command.fileName, command.byteSize);
    if (duplicate) {
      return Result.failure(new ApplicationError(`${command.fileName} is already in this shoot.`, "ALREADY_UPLOADED"));
    }

    const photo = Photo.requestUpload({
      projectId,
      studioId,
      fileName: command.fileName,
      mimeType: command.mimeType,
      byteSize: command.byteSize,
    });

    await this.photos.save(photo);

    const presigned = await this.storage.presignPut({
      key: photo.storageKey.toString(),
      contentType: command.mimeType,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });

    return Result.success({
      photoId: photo.id.toString(),
      uploadUrl: presigned.url,
      storageKey: photo.storageKey.toString(),
      expiresInSeconds: presigned.expiresInSeconds,
    });
  }
}
