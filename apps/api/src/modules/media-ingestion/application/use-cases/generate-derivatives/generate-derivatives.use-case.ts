import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, type ApplicationError } from "../../../../../shared-kernel/errors";
import type { DerivativeVariant } from "../../../domain/value-objects/storage-key";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { ImageResizer } from "../../ports/image-resizer";
import type { ObjectStorageWithBody } from "../../ports/object-storage";
import type { StorageProvider } from "../../../../../shared-kernel/storage-provider";

/**
 * Two sizes, chosen from how the editor actually draws them: the tray and the
 * layout chips are under 120 pixels wide, and a spread slot on a large display is
 * around 1,400. Anything beyond that is pixels the browser decodes and throws away.
 */
export const DERIVATIVE_SPECS: Record<DerivativeVariant, { longestEdge: number; quality: number }> = {
  thumb: { longestEdge: 400, quality: 72 },
  preview: { longestEdge: 1600, quality: 80 },
};

export interface GenerateDerivativesCommand {
  photoId: string;
}

export interface GenerateDerivativesResult {
  photoId: string;
  /** Bytes written per variant, so the caller can report the saving. */
  written: Record<DerivativeVariant, number>;
}

export class GenerateDerivativesUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: ObjectStorageWithBody,
    private readonly resizer: ImageResizer,
    /**
     * When set, display copies are written here — long-term storage — instead of
     * beside the original in the staging bucket, and the preview is cut at
     * `previewLongEdge` rather than the default.
     */
    private readonly permanent?: StorageProvider,
    private readonly previewLongEdge: number = DERIVATIVE_SPECS.preview.longestEdge,
  ) {}

  async execute(
    command: GenerateDerivativesCommand,
  ): Promise<Result<GenerateDerivativesResult, ApplicationError>> {
    const photo = await this.photos.findById(UniqueEntityId.create(command.photoId));
    if (!photo) return Result.failure(new NotFoundError("Photo", command.photoId));

    const original = await this.storage.getObject(photo.storageKey.toString());
    const written = {} as Record<DerivativeVariant, number>;
    const specs = this.permanent
      ? { ...DERIVATIVE_SPECS, preview: { ...DERIVATIVE_SPECS.preview, longestEdge: this.previewLongEdge } }
      : DERIVATIVE_SPECS;

    for (const [variant, spec] of Object.entries(specs) as [
      DerivativeVariant,
      (typeof DERIVATIVE_SPECS)[DerivativeVariant],
    ][]) {
      const body = await this.resizer.toJpeg({ data: original, ...spec });
      const key = photo.storageKey.derivative(variant).toString();
      if (this.permanent) {
        await this.permanent.upload(key, body, { contentType: "image/jpeg" });
      } else {
        await this.storage.putObject({ key, body, contentType: "image/jpeg" });
      }
      written[variant] = body.byteLength;
    }

    // Narrow write, not save(photo): analysis is a second, concurrent job
    // racing on this same row, and re-saving the whole snapshot here would
    // silently revert whichever field IT changed, depending on nothing but
    // which of the two jobs happens to commit last.
    const permanent = this.permanent !== undefined;
    photo.markDerivativesReady({ permanent });
    await this.photos.markDerivativesReady(photo.id, { permanent });

    return Result.success({ photoId: photo.id.toString(), written });
  }
}
