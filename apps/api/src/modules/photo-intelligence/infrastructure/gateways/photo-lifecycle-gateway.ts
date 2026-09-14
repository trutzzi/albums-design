import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { PhotoLifecycle } from "../../application/ports/photo-lifecycle";

export class MediaIngestionPhotoLifecycle implements PhotoLifecycle {
  constructor(private readonly photos: PhotoRepository) {}

  async markAnalysed(photoId: string): Promise<void> {
    const photo = await this.photos.findById(UniqueEntityId.create(photoId));
    if (!photo) return;
    photo.markAnalysed();
    await this.photos.save(photo);
  }
}
