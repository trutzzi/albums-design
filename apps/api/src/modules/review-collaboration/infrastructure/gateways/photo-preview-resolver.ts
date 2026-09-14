import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { ObjectStorage } from "../../../media-ingestion/application/ports/object-storage";
import type { PhotoPreviewResolver } from "../../application/ports/album-gateway";

const PREVIEW_TTL_SECONDS = 60 * 60;

export class StoragePhotoPreviewResolver implements PhotoPreviewResolver {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async previewUrl(photoId: string): Promise<string | null> {
    const photo = await this.photos.findById(UniqueEntityId.create(photoId));
    if (!photo) return null;
    return this.storage.presignGet(photo.storageKey.toString(), PREVIEW_TTL_SECONDS);
  }
}
