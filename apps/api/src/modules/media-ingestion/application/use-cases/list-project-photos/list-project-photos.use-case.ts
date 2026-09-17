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
  /** Spread-sized copy — never the original, which exists for printing. */
  previewUrl: string | null;
  /** Tray-sized copy, a few tens of kilobytes. */
  thumbnailUrl: string | null;
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
    // Before the derivatives land, fall back to the original so a freshly uploaded
    // photo is still visible; it costs one slow frame rather than an empty tray.
    const [previewUrl, thumbnailUrl] = await this.displayUrls(photo);

    return {
      id: photo.id.toString(),
      projectId: photo.projectId.toString(),
      fileName: photo.fileName,
      status: photo.status,
      storageKey: photo.storageKey.toString(),
      byteSize: photo.byteSize,
      createdAt: photo.createdAt.toISOString(),
      previewUrl,
      thumbnailUrl,
    };
  }

  private async displayUrls(photo: Photo): Promise<[string | null, string | null]> {
    if (photo.status === "PENDING_UPLOAD") return [null, null];
    if (!photo.hasDerivatives) {
      const original = await this.storage.presignGet(
        photo.storageKey.toString(),
        PREVIEW_TTL_SECONDS,
      );
      return [original, original];
    }
    return Promise.all([
      this.storage.presignGet(photo.storageKey.derivative("preview").toString(), PREVIEW_TTL_SECONDS),
      this.storage.presignGet(photo.storageKey.derivative("thumb").toString(), PREVIEW_TTL_SECONDS),
    ]);
  }
}
