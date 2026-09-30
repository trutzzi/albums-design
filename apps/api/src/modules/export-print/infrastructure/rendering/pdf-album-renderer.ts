import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import {
  DEFAULT_STYLE,
  TEXT_LINE_HEIGHT,
  TEXT_SIZE_RATIO,
  spacedSlotRect,
  textColorOn,
  type AlbumCoverDTO,
  type AlbumStyleDTO,
  type TextBlockDTO,
} from "@albumflow/contracts";
import { AlbumFonts, wrapText } from "./album-fonts";
import { findTemplate } from "../../../album-composition/domain/layout-template";
import { mmToPoints, type PrintProfile } from "../../domain/print-profile";
import type {
  AlbumPdfRenderer,
  PhotoResolver,
  RenderResult,
  RenderableAlbum,
  RenderableCrop,
  RenderablePlacement,
} from "../../application/ports/album-pdf-renderer";

const POINTS_PER_INCH = 72;
const TRIM_MARK_LENGTH_MM = 4;
const TRIM_MARK_OFFSET_MM = 1;

/**
 * Composition is driven by the same layout model the on-screen editor renders, so
 * the exported file cannot drift from the approved preview. sharp does the pixel
 * work (crop, cover-fit, resample to the profile's dpi); pdf-lib only places boxes.
 */
export class PdfAlbumRenderer implements AlbumPdfRenderer {
  constructor(private readonly photos: PhotoResolver) {}

  async render(album: RenderableAlbum, profile: PrintProfile): Promise<RenderResult> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(album.title);
    pdf.setProducer("AlbumFlow");
    pdf.setCreator("AlbumFlow");

    const bleedMm = profile.bleedMm;
    const trimWidthMm = album.format.pageWidthMm * 2;
    const trimHeightMm = album.format.pageHeightMm;

    const pageWidth = mmToPoints(trimWidthMm + bleedMm * 2);
    const pageHeight = mmToPoints(trimHeightMm + bleedMm * 2);
    const bleed = mmToPoints(bleedMm);
    const watermarkFont = album.watermark ? await pdf.embedFont(StandardFonts.HelveticaBold) : undefined;
    const style = album.style ?? DEFAULT_STYLE;
    const fonts = new AlbumFonts(pdf);
    const ink = hexToRgb(textColorOn(style.background));

    if (album.cover) {
      await this.renderCover(pdf, album.cover, style, fonts, profile, {
        width: mmToPoints(album.format.pageWidthMm + bleedMm * 2),
        height: pageHeight,
        bleed,
      });
      if (album.watermark && watermarkFont) {
        const cover = pdf.getPage(0);
        drawWatermark(cover, album.watermark, watermarkFont, cover.getWidth(), cover.getHeight());
      }
    }

    for (const spread of album.spreads) {
      const page = pdf.addPage([pageWidth, pageHeight]);
      page.setMediaBox(0, 0, pageWidth, pageHeight);
      page.setBleedBox(0, 0, pageWidth, pageHeight);
      page.setTrimBox(bleed, bleed, pageWidth - bleed * 2, pageHeight - bleed * 2);
      // White paper needs no ink; any other colour runs into the bleed like the photos do.
      if (style.background.toLowerCase() !== "#ffffff") {
        page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: hexToRgb(style.background) });
      }

      const template = findTemplate(spread.templateId);
      const fullBleed = template?.fullBleed ?? false;

      for (const placement of spread.placements) {
        if (!placement.photoId) continue;
        const slot = template?.slots.find((candidate) => candidate.id === placement.slotId);
        if (!slot) continue;
        // A hand-resized frame is what the client approved on screen, so it wins.
        const rect = placement.frame ?? spacedSlotRect(slot, fullBleed, style.spacing);

        // Full-bleed art runs to the paper edge; everything else sits inside the trim.
        const areaX = fullBleed ? 0 : bleed;
        const areaY = fullBleed ? 0 : bleed;
        const areaWidth = fullBleed ? pageWidth : pageWidth - bleed * 2;
        const areaHeight = fullBleed ? pageHeight : pageHeight - bleed * 2;

        const rectWidth = rect.width * areaWidth;
        const rectHeight = rect.height * areaHeight;
        const rectX = areaX + rect.x * areaWidth;
        // Templates use a top-left origin; PDF user space is bottom-left.
        const rectY = areaY + areaHeight - rect.y * areaHeight - rectHeight;

        const jpeg = await this.prepareImage(placement, rectWidth, rectHeight, profile.dpi);
        if (!jpeg) continue;

        const embedded = await pdf.embedJpg(jpeg);
        page.drawImage(embedded, { x: rectX, y: rectY, width: rectWidth, height: rectHeight });
        if (style.keyline && !fullBleed) {
          page.drawRectangle({
            x: rectX,
            y: rectY,
            width: rectWidth,
            height: rectHeight,
            borderColor: ink,
            borderWidth: 0.5,
            borderOpacity: 0.45,
          });
        }
      }

      // Words sit inside the trim like a regular slot, so a title can never be cut off.
      for (const block of spread.texts ?? []) {
        await drawTextBlock(page, block, fonts, style, ink, {
          x: bleed,
          y: bleed,
          width: pageWidth - bleed * 2,
          height: pageHeight - bleed * 2,
        });
      }

      if (album.watermark && watermarkFont) {
        drawWatermark(page, album.watermark, watermarkFont, pageWidth, pageHeight);
      }

      if (profile.drawTrimMarks && bleedMm > 0) {
        drawTrimMarks(page, pageWidth, pageHeight, bleed);
      }
    }

    const bytes = await pdf.save();
    return { bytes, pageCount: pdf.getPageCount() };
  }

  /**
   * The front cover as one page of the album's page size. "photo" runs the photo to the
   * edge with the title on a soft band across the lower part; "text" sets the title on
   * the album colour.
   */
  private async renderCover(
    pdf: PDFDocument,
    cover: AlbumCoverDTO,
    style: AlbumStyleDTO,
    fonts: AlbumFonts,
    profile: PrintProfile,
    size: { width: number; height: number; bleed: number },
  ): Promise<void> {
    const { width, height, bleed } = size;
    const page = pdf.addPage([width, height]);
    page.setMediaBox(0, 0, width, height);
    page.setBleedBox(0, 0, width, height);
    page.setTrimBox(bleed, bleed, width - bleed * 2, height - bleed * 2);

    const onPhoto = cover.layout === "photo" && cover.photoId !== null;
    page.drawRectangle({ x: 0, y: 0, width, height, color: hexToRgb(onPhoto ? "#000000" : style.background) });
    if (onPhoto) {
      const jpeg = await this.prepareImage(
        { slotId: "cover", photoId: cover.photoId!, crop: cover.crop, treatment: "COLOR" },
        width,
        height,
        profile.dpi,
      );
      if (jpeg) page.drawImage(await pdf.embedJpg(jpeg), { x: 0, y: 0, width, height });
      page.drawRectangle({ x: 0, y: 0, width, height: height * 0.34, color: rgb(0, 0, 0), opacity: 0.32 });
    }

    const trim = { x: bleed, y: bleed, width: width - bleed * 2, height: height - bleed * 2 };
    const ink = onPhoto ? hexToRgb("#ffffff") : hexToRgb(textColorOn(style.background));
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
    if (cover.title) await drawTextBlock(page, block("title", cover.title, titleTop, "title"), fonts, style, ink, trim);
    if (cover.subtitle) {
      await drawTextBlock(page, block("subtitle", cover.subtitle, titleTop + 0.13, "body"), fonts, style, ink, trim);
    }
  }

  private async prepareImage(
    placement: RenderablePlacement,
    rectWidthPt: number,
    rectHeightPt: number,
    dpi: number,
  ): Promise<Buffer | undefined> {
    const source = await this.photos.resolve(placement.photoId);
    if (!source) return undefined;

    const image = sharp(Buffer.from(source), { failOn: "none" }).rotate();
    const metadata = await image.metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    if (sourceWidth === 0 || sourceHeight === 0) return undefined;

    const region = cropRegion(placement.crop, sourceWidth, sourceHeight);
    const targetWidth = Math.max(1, Math.round((rectWidthPt / POINTS_PER_INCH) * dpi));
    const targetHeight = Math.max(1, Math.round((rectHeightPt / POINTS_PER_INCH) * dpi));

    const pipeline = image
      .extract(region)
      // Centre, not "attention": the crop rect is the photographer's explicit choice,
      // and a smart-crop here would shift it away from the approved preview.
      .resize(targetWidth, targetHeight, { fit: "cover", position: "centre" });

    if (placement.treatment === "BLACK_WHITE") pipeline.grayscale();

    return pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  }
}

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

/**
 * Sets one text block inside `area` (PDF user space, bottom-left origin). Sizes are a
 * fraction of the area's height — the same rule the editor uses — and lines that do
 * not fit the box are dropped rather than spilling over the photos below.
 */
async function drawTextBlock(
  page: PDFPage,
  block: TextBlockDTO,
  fonts: AlbumFonts,
  style: AlbumStyleDTO,
  ink: ReturnType<typeof rgb>,
  area: { x: number; y: number; width: number; height: number },
): Promise<void> {
  if (!block.text.trim()) return;
  const font = await fonts.get(block.font ?? style.font, block.size);
  const size = TEXT_SIZE_RATIO[block.size] * area.height;
  const lineHeight = size * TEXT_LINE_HEIGHT;
  const boxWidth = block.width * area.width;
  const boxLeft = area.x + block.x * area.width;
  const boxTop = area.y + area.height - block.y * area.height;
  const maxLines = Math.max(1, Math.floor((block.height * area.height) / lineHeight));

  const lines = wrapText(block.text, font, size, boxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    const x =
      block.align === "center"
        ? boxLeft + (boxWidth - lineWidth) / 2
        : block.align === "right"
          ? boxLeft + boxWidth - lineWidth
          : boxLeft;
    // Baseline: the line box's top, less the space above the glyphs' cap height.
    const baseline = boxTop - index * lineHeight - (lineHeight + size * 0.7) / 2;
    page.drawText(line, { x, y: baseline, size, font, color: ink });
  });
}

function hexToRgb(hex: string) {
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
}

/**
 * One large diagonal line of text per page, translucent so the layout can still be
 * judged, and drawn over the photos so it cannot be cropped away.
 */
function drawWatermark(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  font: PDFFont,
  pageWidth: number,
  pageHeight: number,
): void {
  const angle = Math.atan2(pageHeight, pageWidth);
  const diagonal = Math.hypot(pageWidth, pageHeight);
  const size = (diagonal * 0.6) / Math.max(1, font.widthOfTextAtSize(text, 1));
  const width = font.widthOfTextAtSize(text, size);
  const height = font.heightAtSize(size);
  // Text is placed from its baseline start; offset so the middle of the text sits on the page centre.
  const x = pageWidth / 2 - (Math.cos(angle) * width) / 2 + (Math.sin(angle) * height) / 2;
  const y = pageHeight / 2 - (Math.sin(angle) * width) / 2 - (Math.cos(angle) * height) / 2;
  const rotate = degrees((angle * 180) / Math.PI);
  // A soft dark shadow under light text reads on both bright and dark photos.
  page.drawText(text, { x: x + size * 0.02, y: y - size * 0.02, size, font, color: rgb(0, 0, 0), opacity: 0.18, rotate });
  page.drawText(text, { x, y, size, font, color: rgb(1, 1, 1), opacity: 0.45, rotate });
}

function drawTrimMarks(
  page: ReturnType<PDFDocument["addPage"]>,
  pageWidth: number,
  pageHeight: number,
  bleed: number,
): void {
  const length = mmToPoints(TRIM_MARK_LENGTH_MM);
  const offset = mmToPoints(TRIM_MARK_OFFSET_MM);
  const black = rgb(0, 0, 0);
  const thickness = 0.5;

  const corners: { x: number; y: number; dx: number; dy: number }[] = [
    { x: bleed, y: bleed, dx: -1, dy: -1 },
    { x: pageWidth - bleed, y: bleed, dx: 1, dy: -1 },
    { x: bleed, y: pageHeight - bleed, dx: -1, dy: 1 },
    { x: pageWidth - bleed, y: pageHeight - bleed, dx: 1, dy: 1 },
  ];

  for (const corner of corners) {
    page.drawLine({
      start: { x: corner.x + corner.dx * offset, y: corner.y },
      end: { x: corner.x + corner.dx * (offset + length), y: corner.y },
      thickness,
      color: black,
    });
    page.drawLine({
      start: { x: corner.x, y: corner.y + corner.dy * offset },
      end: { x: corner.x, y: corner.y + corner.dy * (offset + length) },
      thickness,
      color: black,
    });
  }
}
