import {
  DEFAULT_STYLE,
  TEXT_LINE_HEIGHT,
  TEXT_SIZE_RATIO,
  spacedSlotRect,
  textColorOn,
  type AlbumCoverDTO,
  type AlbumFont,
  type AlbumStyleDTO,
  type PhotoFocus,
  type TextBlockDTO,
} from "@albumflow/contracts";
import { findTemplate } from "#src/modules/album-composition/domain/layout-template";
import { mmToPoints, type PrintProfile } from "../../domain/print-profile";
import type { RenderableAlbum, RenderablePlacement } from "../../application/ports/album-pdf-renderer";

/**
 * Where everything on every page goes, worked out once and painted by both the PDF and
 * the JPG renderer, so the two files cannot disagree by a point. Units are PDF points
 * (1/72 in) with the origin at the page's top-left, bleed included.
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 0–1 per channel. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type DrawOp =
  | { kind: "fill"; box: Box; color: Rgb; opacity?: number }
  | { kind: "stroke"; box: Box; color: Rgb; width: number; opacity: number }
  | { kind: "image"; box: Box; placement: RenderablePlacement; focus?: PhotoFocus | undefined }
  | { kind: "text"; block: TextBlockDTO; area: Box; font: AlbumFont; color: Rgb }
  | { kind: "watermark"; text: string }
  | { kind: "line"; from: { x: number; y: number }; to: { x: number; y: number }; width: number; color: Rgb };

export interface LaidOutPage {
  /** "cover", or the spread's number from 1. */
  name: "cover" | number;
  width: number;
  height: number;
  bleed: number;
  ops: DrawOp[];
}

const TRIM_MARK_LENGTH_MM = 4;
const TRIM_MARK_OFFSET_MM = 1;
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 1, g: 1, b: 1 };

export function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

/** Every page of the album in print order: the cover (if any), then each spread. */
export function layoutAlbum(
  album: RenderableAlbum,
  profile: PrintProfile,
  options: { trimMarks: boolean },
): LaidOutPage[] {
  const bleedMm = profile.bleedMm;
  const bleed = mmToPoints(bleedMm);
  const style = album.style ?? DEFAULT_STYLE;
  const pages: LaidOutPage[] = [];
  const height = mmToPoints(album.format.pageHeightMm + bleedMm * 2);

  if (album.cover) {
    const cover = layoutCover(album.cover, style, album.focusByPhoto?.[album.cover.photoId ?? ""], {
      width: mmToPoints(album.format.pageWidthMm + bleedMm * 2),
      height,
      bleed,
    });
    if (album.watermark) cover.ops.push({ kind: "watermark", text: album.watermark });
    pages.push(cover);
  }

  const width = mmToPoints(album.format.pageWidthMm * 2 + bleedMm * 2);
  const ink = hexToRgb(textColorOn(style.background));
  const trim: Box = { x: bleed, y: bleed, width: width - bleed * 2, height: height - bleed * 2 };

  album.spreads.forEach((spread, index) => {
    const ops: DrawOp[] = [];
    // White paper needs no ink; any other colour runs into the bleed like the photos do.
    if (style.background.toLowerCase() !== "#ffffff") {
      ops.push({ kind: "fill", box: { x: 0, y: 0, width, height }, color: hexToRgb(style.background) });
    }

    const template = findTemplate(spread.templateId);
    const fullBleed = template?.fullBleed ?? false;
    // Full-bleed art runs to the paper edge; everything else sits inside the trim.
    const area: Box = fullBleed ? { x: 0, y: 0, width, height } : trim;
    for (const placement of spread.placements) {
      if (!placement.photoId) continue;
      const slot = template?.slots.find((candidate) => candidate.id === placement.slotId);
      if (!slot) continue;
      // A hand-resized frame is what the client approved on screen, so it wins.
      const rect = placement.frame ?? spacedSlotRect(slot, template!, style.spacing);
      const box: Box = {
        x: area.x + rect.x * area.width,
        y: area.y + rect.y * area.height,
        width: rect.width * area.width,
        height: rect.height * area.height,
      };
      ops.push({ kind: "image", box, placement, focus: album.focusByPhoto?.[placement.photoId] });
      if (style.keyline && !fullBleed) ops.push({ kind: "stroke", box, color: ink, width: 0.5, opacity: 0.45 });
    }

    // Words sit inside the trim like a regular slot, so a title can never be cut off.
    for (const block of spread.texts ?? []) {
      if (block.text.trim()) ops.push({ kind: "text", block, area: trim, font: block.font ?? style.font, color: ink });
    }
    if (album.watermark) ops.push({ kind: "watermark", text: album.watermark });
    if (options.trimMarks && bleedMm > 0) ops.push(...trimMarks(width, height, bleed));

    pages.push({ name: index + 1, width, height, bleed, ops });
  });
  return pages;
}

/**
 * The front cover as one page of the album's page size. "photo" runs the photo to the
 * edge with the title on a soft band across the lower part; "text" sets the title on
 * the album colour.
 */
function layoutCover(
  cover: AlbumCoverDTO,
  style: AlbumStyleDTO,
  focus: PhotoFocus | undefined,
  size: { width: number; height: number; bleed: number },
): LaidOutPage {
  const { width, height, bleed } = size;
  const ops: DrawOp[] = [];
  const onPhoto = cover.layout === "photo" && cover.photoId !== null;
  const page: Box = { x: 0, y: 0, width, height };
  ops.push({ kind: "fill", box: page, color: onPhoto ? BLACK : hexToRgb(style.background) });
  if (onPhoto) {
    ops.push({
      kind: "image",
      box: page,
      placement: { slotId: "cover", photoId: cover.photoId!, crop: cover.crop, treatment: "COLOR" },
      focus,
    });
    ops.push({
      kind: "fill",
      box: { x: 0, y: height * 0.66, width, height: height * 0.34 },
      color: BLACK,
      opacity: 0.32,
    });
  }

  const trim: Box = { x: bleed, y: bleed, width: width - bleed * 2, height: height - bleed * 2 };
  const ink = onPhoto ? WHITE : hexToRgb(textColorOn(style.background));
  // Photo covers carry the title low, on the band; text covers centre it slightly above the middle.
  const titleTop = onPhoto ? 0.72 : 0.36;
  const block = (id: string, text: string, top: number, sizeName: TextBlockDTO["size"]): TextBlockDTO => ({
    id,
    text,
    x: 0.08,
    y: top,
    width: 0.84,
    height: 0.2,
    size: sizeName,
    align: "center",
  });
  const font = style.font;
  if (cover.title)
    ops.push({ kind: "text", block: block("title", cover.title, titleTop, "title"), area: trim, font, color: ink });
  if (cover.subtitle) {
    ops.push({
      kind: "text",
      block: block("subtitle", cover.subtitle, titleTop + 0.13, "body"),
      area: trim,
      font,
      color: ink,
    });
  }
  return { name: "cover", width, height, bleed, ops };
}

function trimMarks(width: number, height: number, bleed: number): DrawOp[] {
  const length = mmToPoints(TRIM_MARK_LENGTH_MM);
  const offset = mmToPoints(TRIM_MARK_OFFSET_MM);
  const corners = [
    { x: bleed, y: height - bleed, dx: -1, dy: 1 },
    { x: width - bleed, y: height - bleed, dx: 1, dy: 1 },
    { x: bleed, y: bleed, dx: -1, dy: -1 },
    { x: width - bleed, y: bleed, dx: 1, dy: -1 },
  ];
  return corners.flatMap((corner): DrawOp[] => [
    {
      kind: "line",
      from: { x: corner.x + corner.dx * offset, y: corner.y },
      to: { x: corner.x + corner.dx * (offset + length), y: corner.y },
      width: 0.5,
      color: BLACK,
    },
    {
      kind: "line",
      from: { x: corner.x, y: corner.y + corner.dy * offset },
      to: { x: corner.x, y: corner.y + corner.dy * (offset + length) },
      width: 0.5,
      color: BLACK,
    },
  ]);
}

/** How wide a run of text is at a size: what both renderers' fonts can tell. */
export interface TextMeasure {
  widthOfTextAtSize(text: string, size: number): number;
}

/**
 * Greedy word wrap to `maxWidth`, keeping the line breaks the photographer typed. A single
 * word wider than the box is left on its own line rather than broken mid-word.
 */
export function wrapText(text: string, font: TextMeasure, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0]!;
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The lines of one text block and where each sits: x of its start and its baseline, from
 * the page's top. Sizes are a fraction of the area's height — the editor's rule — and lines
 * that do not fit the box are dropped rather than spilling over the photos below.
 */
export function setTextBlock(
  block: TextBlockDTO,
  area: Box,
  font: TextMeasure,
): { size: number; lines: { text: string; x: number; baseline: number }[] } {
  const size = TEXT_SIZE_RATIO[block.size] * area.height;
  const lineHeight = size * TEXT_LINE_HEIGHT;
  const boxWidth = block.width * area.width;
  const boxLeft = area.x + block.x * area.width;
  const boxTop = area.y + block.y * area.height;
  const maxLines = Math.max(1, Math.floor((block.height * area.height) / lineHeight));
  const lines = wrapText(block.text, font, size, boxWidth)
    .slice(0, maxLines)
    .map((text, index) => {
      const lineWidth = font.widthOfTextAtSize(text, size);
      const x =
        block.align === "center"
          ? boxLeft + (boxWidth - lineWidth) / 2
          : block.align === "right"
            ? boxLeft + boxWidth - lineWidth
            : boxLeft;
      // Baseline: the line box's top, plus the space above the glyphs' cap height.
      return { text, x, baseline: boxTop + index * lineHeight + (lineHeight + size * 0.7) / 2 };
    });
  return { size, lines };
}

/**
 * One large diagonal line of text across the page, centred: where its baseline starts
 * (from the page's top), its size, and its angle (counter-clockwise, radians).
 */
export function placeWatermark(
  text: string,
  font: TextMeasure & { heightAtSize(size: number): number },
  width: number,
  height: number,
): { x: number; baseline: number; size: number; angle: number } {
  const angle = Math.atan2(height, width);
  const diagonal = Math.hypot(width, height);
  const size = (diagonal * 0.6) / Math.max(1, font.widthOfTextAtSize(text, 1));
  const textWidth = font.widthOfTextAtSize(text, size);
  const textHeight = font.heightAtSize(size);
  // Placed from its baseline start; offset so the middle of the text sits on the page centre.
  const x = width / 2 - (Math.cos(angle) * textWidth) / 2 + (Math.sin(angle) * textHeight) / 2;
  const fromBottom = height / 2 - (Math.sin(angle) * textWidth) / 2 - (Math.cos(angle) * textHeight) / 2;
  return { x, baseline: height - fromBottom, size, angle };
}
