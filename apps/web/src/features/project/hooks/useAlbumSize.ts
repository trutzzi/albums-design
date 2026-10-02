import { useState } from "react";
import type { AlbumFormatDTO } from "@albumflow/contracts";
import {
  ALBUM_DIMENSIONS,
  DEFAULT_ALBUM_DIMENSION_ID,
  DEFAULT_BLEED_MM,
} from "@/features/project/lib/album-dimensions";

export const CUSTOM_DIMENSION_ID = "custom";

/**
 * The print size new albums are built at — a preset or a custom size — shared by
 * "Generate draft" and "Build album from picks" so both make the same book.
 */
export function useAlbumSize() {
  const [dimensionId, setDimensionId] = useState(DEFAULT_ALBUM_DIMENSION_ID);
  const [customWidthCm, setCustomWidthCm] = useState(25);
  const [customHeightCm, setCustomHeightCm] = useState(25);

  const selected =
    dimensionId === CUSTOM_DIMENSION_ID
      ? { widthCm: customWidthCm, heightCm: customHeightCm }
      : (ALBUM_DIMENSIONS.find((option) => option.id === dimensionId) ?? ALBUM_DIMENSIONS[0]!);

  const format: AlbumFormatDTO = {
    pageWidthMm: selected.widthCm * 10,
    pageHeightMm: selected.heightCm * 10,
    bleedMm: DEFAULT_BLEED_MM,
  };

  return {
    dimensionId,
    setDimensionId,
    customWidthCm,
    setCustomWidthCm,
    customHeightCm,
    setCustomHeightCm,
    selected,
    format,
  };
}

export type AlbumSize = ReturnType<typeof useAlbumSize>;
