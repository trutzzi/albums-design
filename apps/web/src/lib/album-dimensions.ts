export interface AlbumDimension {
  id: string;
  widthCm: number;
  heightCm: number;
  /** "square" | "portrait" | "landscape" — used to pick a translated shape word next to the size. */
  shape: "square" | "portrait" | "landscape";
}

/**
 * The popular photobook page sizes (closed-book dimensions, in centimetres)
 * offered when generating an album — square sizes first since they're the
 * most commonly ordered for weddings, then portrait/landscape pairs at a
 * few standard sizes. `bleedMm` isn't part of this list: it comes from
 * `DEFAULT_FORMAT`/the print profile, a separate concern from page size.
 */
export const ALBUM_DIMENSIONS: AlbumDimension[] = [
  { id: "20x20", widthCm: 20, heightCm: 20, shape: "square" },
  { id: "21x21", widthCm: 21, heightCm: 21, shape: "square" },
  { id: "25x25", widthCm: 25, heightCm: 25, shape: "square" },
  { id: "30x30", widthCm: 30, heightCm: 30, shape: "square" },
  { id: "20x25", widthCm: 20, heightCm: 25, shape: "portrait" },
  { id: "25x20", widthCm: 25, heightCm: 20, shape: "landscape" },
  { id: "21x30", widthCm: 21, heightCm: 30, shape: "portrait" },
  { id: "30x21", widthCm: 30, heightCm: 21, shape: "landscape" },
  { id: "30x40", widthCm: 30, heightCm: 40, shape: "portrait" },
  { id: "40x30", widthCm: 40, heightCm: 30, shape: "landscape" },
];

export const DEFAULT_ALBUM_DIMENSION_ID = "25x25";

/** The `AlbumFormat.bleedMm` this app has always defaulted new albums to — kept the same for a custom-size album. */
export const DEFAULT_BLEED_MM = 3;
