import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Photo } from "#src/modules/media-ingestion/domain/photo";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { ObjectStorage } from "#src/modules/media-ingestion/application/ports/object-storage";
import type { StorageProvider } from "#src/shared-kernel/storage-provider";
import type { PhotoPreviewResolver } from "../../application/ports/album-gateway";

const PREVIEW_TTL_SECONDS = 60 * 60;

export class StoragePhotoPreviewResolver implements PhotoPreviewResolver {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: ObjectStorage,
    private readonly permanent?: StorageProvider,
  ) {}

  async previewUrls(photoIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(photoIds)];
    if (unique.length === 0) return new Map();
    // One query for the whole album: the review page used to load each placed photo on its own.
    const photos = await this.photos.findByIds(unique.map((id) => UniqueEntityId.create(id)));
    const entries = await Promise.all(
      photos.map(async (photo) => [photo.id.toString(), await this.urlFor(photo)] as const),
    );
    return new Map(entries);
  }

  private urlFor(photo: Photo): Promise<string> {
    // Clients review on phones over mobile data; the original is for the printer.
    const key = photo.hasDerivatives ? photo.storageKey.derivative("preview") : photo.storageKey;
    if (photo.permanentDerivatives && this.permanent) {
      return this.permanent.getUrl(key.toString(), { expiresInSeconds: PREVIEW_TTL_SECONDS });
    }
    return this.storage.presignGet(key.toString(), PREVIEW_TTL_SECONDS);
  }
}
