import type { Crop } from "@albumflow/contracts";

/**
 * The crop rect is expressed in the source photo's own normalised coordinates, and
 * the exporter reads the exact same numbers (sharp extracts that rect, then cover-fits
 * it into the slot). Everything here exists to render that identically in the browser,
 * so the on-screen preview and the printed page cannot disagree.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/**
 * The zoom-1 crop: the largest slot-shaped rect that fits inside the photo, centred.
 * This renders pixel-for-pixel the same as a plain `object-fit: cover`, so a photo
 * the photographer has never touched does not jump the first time they nudge it.
 */
export function baseCrop(imageAspect: number, slotAspect: number): Crop {
  if (imageAspect >= slotAspect) {
    const width = slotAspect / imageAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = imageAspect / slotAspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

export function zoomOf(crop: Crop, imageAspect: number, slotAspect: number): number {
  const base = baseCrop(imageAspect, slotAspect);
  if (crop.width <= 0) return MIN_ZOOM;
  return clamp(base.width / crop.width, MIN_ZOOM, MAX_ZOOM);
}

/** Rescales the crop around its own centre, keeping the subject where the eye left it. */
export function withZoom(
  crop: Crop,
  zoom: number,
  imageAspect: number,
  slotAspect: number,
): Crop {
  const base = baseCrop(imageAspect, slotAspect);
  const safeZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const width = base.width / safeZoom;
  const height = base.height / safeZoom;
  const centreX = crop.x + crop.width / 2;
  const centreY = crop.y + crop.height / 2;
  return clampCrop({ x: centreX - width / 2, y: centreY - height / 2, width, height });
}

/** `dx`/`dy` are drag distances as a fraction of the slot's own width and height. */
export function pannedCrop(
  crop: Crop,
  dx: number,
  dy: number,
  imageAspect: number,
  slotAspect: number,
): Crop {
  const { imageWidth, imageHeight } = displayedSize(crop, imageAspect, slotAspect);
  // Dragging right reveals more of the photo's left edge, so the crop origin moves back.
  return clampCrop({
    ...crop,
    x: crop.x - dx / imageWidth,
    y: crop.y - dy / (imageHeight * slotAspect),
  });
}

export function clampCrop(crop: Crop): Crop {
  const width = clamp(crop.width, 0.05, 1);
  const height = clamp(crop.height, 0.05, 1);
  return {
    width,
    height,
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
  };
}

function displayedSize(crop: Crop, imageAspect: number, slotAspect: number) {
  // Cover semantics: whichever axis needs more magnification wins.
  const imageWidth = Math.max(1 / crop.width, imageAspect / (slotAspect * crop.height));
  return { imageWidth, imageHeight: imageWidth / imageAspect };
}

export interface CropStyle {
  width: string;
  height: string;
  left: string;
  top: string;
}

/** CSS for an absolutely positioned <img> inside an overflow-hidden slot. */
export function cropToStyle(crop: Crop, imageAspect: number, slotAspect: number): CropStyle {
  const { imageWidth, imageHeight } = displayedSize(crop, imageAspect, slotAspect);
  const left = 0.5 - (crop.x + crop.width / 2) * imageWidth;
  const top = 1 / slotAspect / 2 - (crop.y + crop.height / 2) * imageHeight;
  return {
    width: `${imageWidth * 100}%`,
    height: `${imageHeight * slotAspect * 100}%`,
    left: `${left * 100}%`,
    top: `${top * slotAspect * 100}%`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
