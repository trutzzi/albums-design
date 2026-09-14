import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, type ApplicationError } from "../../../../../shared-kernel/errors";
import type { ProjectRepository } from "../../../domain/project-repository";
import type { PhotoRepository } from "../../../domain/photo-repository";
import { Photo } from "../../../domain/photo";
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
