import sharp from "sharp";
import { focusedBaseCrop, isUntouchedCrop, rotatedFocus, type PhotoFocus } from "@albumflow/contracts";
import type { PhotoResolver, RenderableCrop, RenderablePlacement } from "../../application/ports/album-pdf-renderer";

export function cropRegion(
  crop: RenderableCrop,
  sourceWidth: number,
  sourceHeight: number,
): { left: number; top: number; width: number; height: number } {
  const width = Math.max(1, Math.round(crop.width * sourceWidth));
  const height = Math.max(1, Math.round(crop.height * sourceHeight));
  const left = Math.min(sourceWidth - width, Math.max(0, Math.round(crop.x * sourceWidth)));
  const top = Math.min(sourceHeight - height, Math.max(0, Math.round(crop.y * sourceHeight)));
  return { left, top, width, height };
}

/** Pixels as they come: three channels, or one for a black-and-white photo. */
export interface RawPhoto {
  data: Buffer;
  width: number;
  height: number;
  channels: 1 | 3;
}

/**
 * A placed photo cut and resampled to exactly `width` × `height` pixels: the PDF embeds it
 * as a JPEG, the JPG export composites the raw pixels (no lossy step before the final file).
 */
export async function rasterisePhoto(
  photos: PhotoResolver,
  placement: RenderablePlacement,
  size: { width: number; height: number },
  focus: PhotoFocus | undefined,
  as: "jpeg",
): Promise<Buffer | undefined>;
export async function rasterisePhoto(
  photos: PhotoResolver,
  placement: RenderablePlacement,
  size: { width: number; height: number },
  focus: PhotoFocus | undefined,
  as: "raw",
): Promise<RawPhoto | undefined>;
export async function rasterisePhoto(
  photos: PhotoResolver,
  placement: RenderablePlacement,
  size: { width: number; height: number },
  focus: PhotoFocus | undefined,
  as: "jpeg" | "raw",
): Promise<Buffer | RawPhoto | undefined> {
  const source = await photos.resolve(placement.photoId);
  if (!source) return undefined;

  // Upright from the camera's orientation tag first, then the photographer's own turn, in one
  // decode. The crop is cut after both, so it is measured on the photo as it is shown.
  const image = sharp(Buffer.from(source), { failOn: "none" }).autoOrient();
  if (placement.rotation) image.rotate(placement.rotation);
  const metadata = await image.metadata();
  // `autoOrient` holds the upright size; the file's own width and height may be sideways.
  const upright = metadata.autoOrient ?? { width: metadata.width ?? 0, height: metadata.height ?? 0 };
  const quarter = placement.rotation === 90 || placement.rotation === 270;
  const sourceWidth = quarter ? upright.height : upright.width;
  const sourceHeight = quarter ? upright.width : upright.height;
  if (!sourceWidth || !sourceHeight) return undefined;

  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  // A crop nobody framed by hand centres on the photo's subject — the very rect the
  // editor and the client proof draw for it, so print matches what was approved.
  const crop = isUntouchedCrop(placement.crop)
    ? focusedBaseCrop(sourceWidth / sourceHeight, width / height, rotatedFocus(focus, placement.rotation) ?? undefined)
    : placement.crop;

  const pipeline = image
    .extract(cropRegion(crop, sourceWidth, sourceHeight))
    // Centre, not "attention": the crop rect is the photographer's explicit choice,
    // and a smart-crop here would shift it away from the approved preview.
    .resize(width, height, { fit: "cover", position: "centre" });
  if (placement.treatment === "BLACK_WHITE") pipeline.grayscale();

  if (as === "jpeg") return pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels === 1 ? 1 : 3 };
}
