import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { ObjectStorage } from "../../../media-ingestion/application/ports/object-storage";
import type { StorageProvider } from "../../../../shared-kernel/storage-provider";
import type { PhotoPreviewResolver } from "../../application/ports/album-gateway";

const PREVIEW_TTL_SECONDS = 60 * 60;

export class StoragePhotoPreviewResolver implements PhotoPreviewResolver {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: ObjectStorage,
    private readonly permanent?: StorageProvider,
  ) {}

  async previewUrl(photoId: string): Promise<string | null> {
    const photo = await this.photos.findById(UniqueEntityId.create(photoId));
    if (!photo) return null;
    // Clients review on phones over mobile data; the original is for the printer.
    const key = photo.hasDerivatives
      ? photo.storageKey.derivative("preview")
      : photo.storageKey;
    if (photo.permanentDerivatives && this.permanent) {
      return this.permanent.getUrl(key.toString(), { expiresInSeconds: PREVIEW_TTL_SECONDS });
    }
    return this.storage.presignGet(key.toString(), PREVIEW_TTL_SECONDS);
  }
}
