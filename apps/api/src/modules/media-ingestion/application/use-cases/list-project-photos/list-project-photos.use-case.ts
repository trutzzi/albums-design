import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { Photo } from "#src/modules/media-ingestion/domain/photo";
import type { ObjectStorage } from "../../ports/object-storage";
import { compareFileNames } from "#src/shared-kernel/natural-order";
import type { StorageProvider } from "#src/shared-kernel/storage-provider";

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

  /**
   * Just these photos, in the order given — for a client page that shows 60 photos of a
   * 2,000-photo shoot, so it signs 60 pairs of URLs rather than the whole listing. Only
   * photos of this shoot with real display copies are returned: this goes to clients, and
   * the original fallback below is for the photographer only.
   */
  async displayCopies(projectId: string, photoIds: readonly string[]): Promise<ProjectPhotoView[]> {
    if (photoIds.length === 0) return [];
    const found = await this.photos.findByIds([...new Set(photoIds)].map((id) => UniqueEntityId.create(id)));
    const byId = new Map(
      found
        .filter((photo) => photo.projectId.toString() === projectId && photo.hasDerivatives)
        .map((photo) => [photo.id.toString(), photo]),
    );
    const ordered = photoIds.flatMap((id) => {
      const photo = byId.get(id);
      return photo ? [photo] : [];
    });
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
      const original = await this.storage.presignGet(photo.storageKey.toString(), PREVIEW_TTL_SECONDS);
      return [original, original];
    }
    const previewKey = photo.storageKey.derivative("preview").toString();
    const thumbKey = photo.storageKey.derivative("thumb").toString();
    if (photo.permanentDerivatives && this.permanent) {
      const options = { expiresInSeconds: PREVIEW_TTL_SECONDS };
      return Promise.all([this.permanent.getUrl(previewKey, options), this.permanent.getUrl(thumbKey, options)]);
    }
    return Promise.all([
      this.storage.presignGet(previewKey, PREVIEW_TTL_SECONDS),
      this.storage.presignGet(thumbKey, PREVIEW_TTL_SECONDS),
    ]);
  }
}
