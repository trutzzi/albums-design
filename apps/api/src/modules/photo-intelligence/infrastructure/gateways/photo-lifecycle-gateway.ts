import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
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

  async markAnalysisFailed(photoId: string): Promise<void> {
    // Only a photo still waiting on analysis, checked in the same write: a success that
    // lands at the same moment is never overwritten, and a missing photo is a no-op.
    await this.photos.updateStatusIf(UniqueEntityId.create(photoId), ["UPLOADED", "ANALYSIS_QUEUED"], "FAILED");
  }
}
