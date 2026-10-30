import { PAGE_SIDE_MAX_MM, PAGE_SIDE_MIN_MM, sameAlbumShape, type AlbumFormatDTO } from "@albumflow/contracts";
import { ALBUM_DIMENSIONS } from "@/features/project/lib/album-dimensions";
import { checkAlbum, type CheckInput } from "./album-check";

export interface SizeOption {
  pageWidthMm: number;
  pageHeightMm: number;
}

/**
 * The lab sizes this album can move to without stretching a layout: the presets of the
 * same shape, smallest first, without the size it already is.
 */
export function sizeOptions(format: Pick<AlbumFormatDTO, "pageWidthMm" | "pageHeightMm">): SizeOption[] {
  return ALBUM_DIMENSIONS.map((option) => ({ pageWidthMm: option.widthCm * 10, pageHeightMm: option.heightCm * 10 }))
    .filter((option) => sameAlbumShape(format, option))
    .filter((option) => option.pageWidthMm !== format.pageWidthMm || option.pageHeightMm !== format.pageHeightMm)
    .sort((a, b) => a.pageWidthMm - b.pageWidthMm);
}

export interface Sharpness {
  /** Photos that would print soft (below 200 dpi) and visibly pixelated (below 150). */
  soft: number;
  pixelated: number;
}

function sharpnessOf(input: CheckInput): Sharpness {
  const low = checkAlbum(input).filter((issue) => issue.kind === "lowResolution");
  return {
    soft: low.filter((issue) => issue.severity === "warning").length,
    pixelated: low.filter((issue) => issue.severity === "error").length,
  };
}

/**
 * What a new size does to print quality, from the same check the editor runs: a bigger
 * page spreads the same pixels further, so photos that were fine can turn soft.
 */
export function sharpnessAt(
  input: CheckInput,
  size: SizeOption,
): { now: Sharpness; then: Sharpness; unchecked: number } {
  return {
    now: sharpnessOf(input),
    then: sharpnessOf({ ...input, album: { ...input.album, format: { ...input.album.format, ...size } } }),
    unchecked: uncheckedPhotos(input),
  };
}

/** Placed photos the check cannot judge: no analysis yet, so no pixel size to measure. */
function uncheckedPhotos({ album, analyses, existingPhotoIds }: CheckInput): number {
  const placed = new Set(
    album.spreads.flatMap((spread) =>
      spread.placements.map((placement) => placement.photoId).filter((id) => id && existingPhotoIds.has(id)),
    ),
  );
  return [...placed].filter((id) => !analyses.has(id)).length;
}

/** What the preview says, and how it looks: one state, so the words and the colour agree. */
export type SharpnessVerdict = "pixelated" | "softer" | "alreadySoft" | "unchecked" | "sharp";

export function sharpnessVerdict({
  now,
  then,
  unchecked = 0,
}: {
  now: Sharpness;
  then: Sharpness;
  unchecked?: number;
}): SharpnessVerdict {
  if (then.pixelated > 0) return "pixelated";
  if (then.soft > now.soft) return "softer";
  if (then.soft > 0) return "alreadySoft";
  // "Every photo stays sharp" only when every photo was actually measured.
  if (unchecked > 0) return "unchecked";
  return "sharp";
}

/**
 * The size a typed width makes: the height follows the album's shape. "empty" while
 * nothing is typed, "outOfRange" when either side would be past what a lab prints.
 */
export function customSize(
  widthCm: string,
  format: Pick<AlbumFormatDTO, "pageWidthMm" | "pageHeightMm">,
): SizeOption | "empty" | "outOfRange" {
  if (widthCm.trim() === "") return "empty";
  const pageWidthMm = Math.round(Number(widthCm) * 10);
  const pageHeightMm = Math.round((pageWidthMm * format.pageHeightMm) / format.pageWidthMm);
  const inRange = (side: number) => Number.isFinite(side) && side >= PAGE_SIDE_MIN_MM && side <= PAGE_SIDE_MAX_MM;
  return inRange(pageWidthMm) && inRange(pageHeightMm) ? { pageWidthMm, pageHeightMm } : "outOfRange";
}
