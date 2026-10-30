import { sameAlbumShape, type AlbumFormatDTO } from "@albumflow/contracts";
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
export function sharpnessAt(input: CheckInput, size: SizeOption): { now: Sharpness; then: Sharpness } {
  return {
    now: sharpnessOf(input),
    then: sharpnessOf({ ...input, album: { ...input.album, format: { ...input.album.format, ...size } } }),
  };
}
