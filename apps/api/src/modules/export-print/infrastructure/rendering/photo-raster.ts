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

  // Upright from the camera's orientation tag first, then the photographer's own turn. A
  // sharp pipeline takes a single rotation, so a turned photo is made upright in a pass of its own.
  const upright = sharp(Buffer.from(source), { failOn: "none" }).rotate();
  const image = placement.rotation
    ? sharp(await upright.toBuffer(), { failOn: "none" }).rotate(placement.rotation)
    : upright;
  const metadata = await sharp(Buffer.from(source), { failOn: "none" }).metadata();
  // Metadata describes the stored file: swap for the camera's sideways tags and for a quarter turn.
  const sideways = (metadata.orientation ?? 1) >= 5;
  const quarter = placement.rotation === 90 || placement.rotation === 270;
  const storedWidth = metadata.width ?? 0;
  const storedHeight = metadata.height ?? 0;
  const turned = sideways !== quarter;
  const sourceWidth = turned ? storedHeight : storedWidth;
  const sourceHeight = turned ? storedWidth : storedHeight;
  if (sourceWidth === 0 || sourceHeight === 0) return undefined;

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
