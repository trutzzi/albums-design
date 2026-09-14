import type { PrintProfile } from "../../domain/print-profile";

export interface RenderableCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderableFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderablePlacement {
  slotId: string;
  photoId: string;
  crop: RenderableCrop;
  treatment: "COLOR" | "BLACK_WHITE";
  /** Overrides the template slot rectangle when the photographer resized it. */
  frame?: RenderableFrame | undefined;
}

export interface RenderableSpread {
  templateId: string;
  placements: RenderablePlacement[];
}

export interface RenderableAlbum {
  id: string;
  title: string;
  format: { pageWidthMm: number; pageHeightMm: number; bleedMm: number };
  spreads: RenderableSpread[];
}

export interface RenderResult {
  bytes: Uint8Array;
  pageCount: number;
}

export interface AlbumPdfRenderer {
  render(album: RenderableAlbum, profile: PrintProfile): Promise<RenderResult>;
}

/** Resolves a photo id to the bytes of its stored original. */
export interface PhotoResolver {
  resolve(photoId: string): Promise<Uint8Array | undefined>;
}

export interface ExportStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
}
