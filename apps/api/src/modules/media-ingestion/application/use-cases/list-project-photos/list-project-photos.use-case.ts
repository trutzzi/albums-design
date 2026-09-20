import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { Photo } from "../../../domain/photo";
import type { ObjectStorage } from "../../ports/object-storage";
import { compareFileNames } from "../../../../../shared-kernel/natural-order";
import type { StorageProvider } from "../../../../../shared-kernel/storage-provider";

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
    /** Where display copies live for photos processed while a long-term provider was configured. */
    private readonly permanent?: StorageProvider,
  ) {}

  async execute(projectId: string): Promise<ProjectPhotoView[]> {
    const photos = await this.photos.findByProjectId(UniqueEntityId.create(projectId));
    // The database returns rows in no particular order, and uploads finish in whatever
    // order the network allows — so the listing is put in file-name order here.
    const ordered = [...photos].sort((a, b) =>
      compareFileNames({ fileName: a.fileName, id: a.id.toString() }, { fileName: b.fileName, id: b.id.toString() }),
    );
    return Promise.all(ordered.map((photo) => this.toView(photo)));
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
    const previewKey = photo.storageKey.derivative("preview").toString();
    const thumbKey = photo.storageKey.derivative("thumb").toString();
    if (photo.permanentDerivatives && this.permanent) {
      const options = { expiresInSeconds: PREVIEW_TTL_SECONDS };
      return Promise.all([
        this.permanent.getUrl(previewKey, options),
        this.permanent.getUrl(thumbKey, options),
      ]);
    }
    return Promise.all([
      this.storage.presignGet(previewKey, PREVIEW_TTL_SECONDS),
      this.storage.presignGet(thumbKey, PREVIEW_TTL_SECONDS),
    ]);
  }
}
