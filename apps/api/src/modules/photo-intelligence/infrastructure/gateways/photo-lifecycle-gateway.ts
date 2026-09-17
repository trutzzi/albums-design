import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { PhotoLifecycle } from "../../application/ports/photo-lifecycle";

export class MediaIngestionPhotoLifecycle implements PhotoLifecycle {
  constructor(private readonly photos: PhotoRepository) {}

  async markAnalysed(photoId: string): Promise<void> {
    const id = UniqueEntityId.create(photoId);
    const photo = await this.photos.findById(id);
    if (!photo) return;
    // `photo.markAnalysed()` still enforces the state-machine invariant (it
    // throws from an invalid prior status) — only the persistence narrows.
    // Derivative generation is a second, concurrent job racing on this same
    // row; writing the whole snapshot back here would silently revert
    // whichever field it touches, depending on nothing but timing.
    photo.markAnalysed();
    await this.photos.updateStatus(id, photo.status);
  }
}
