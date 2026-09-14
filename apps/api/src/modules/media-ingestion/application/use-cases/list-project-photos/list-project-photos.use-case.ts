import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { Photo } from "../../../domain/photo";
import type { ObjectStorage } from "../../ports/object-storage";

const PREVIEW_TTL_SECONDS = 60 * 60;

export interface ProjectPhotoView {
  id: string;
  projectId: string;
  fileName: string;
  status: string;
  storageKey: string;
  byteSize: number;
  createdAt: string;
  previewUrl: string | null;
}

export class ListProjectPhotosUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(projectId: string): Promise<ProjectPhotoView[]> {
    const photos = await this.photos.findByProjectId(UniqueEntityId.create(projectId));
    return Promise.all(photos.map((photo) => this.toView(photo)));
  }

  private async toView(photo: Photo): Promise<ProjectPhotoView> {
    const previewUrl =
      photo.status === "PENDING_UPLOAD"
        ? null
        : await this.storage.presignGet(photo.storageKey.toString(), PREVIEW_TTL_SECONDS);

    return {
      id: photo.id.toString(),
      projectId: photo.projectId.toString(),
      fileName: photo.fileName,
      status: photo.status,
      storageKey: photo.storageKey.toString(),
      byteSize: photo.byteSize,
      createdAt: photo.createdAt.toISOString(),
      previewUrl,
    };
  }
}
