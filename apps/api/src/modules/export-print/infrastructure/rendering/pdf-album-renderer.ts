import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
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

    for (const spread of album.spreads) {
      const page = pdf.addPage([pageWidth, pageHeight]);
      page.setMediaBox(0, 0, pageWidth, pageHeight);
      page.setBleedBox(0, 0, pageWidth, pageHeight);
      page.setTrimBox(bleed, bleed, pageWidth - bleed * 2, pageHeight - bleed * 2);

      const template = findTemplate(spread.templateId);
      const fullBleed = template?.fullBleed ?? false;

      for (const placement of spread.placements) {
        if (!placement.photoId) continue;
        const slot = template?.slots.find((candidate) => candidate.id === placement.slotId);
        if (!slot) continue;
        // A hand-resized frame is what the client approved on screen, so it wins.
        const rect = placement.frame ?? slot;

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
      }

      if (profile.drawTrimMarks && bleedMm > 0) {
        drawTrimMarks(page, pageWidth, pageHeight, bleed);
      }
    }

    const bytes = await pdf.save();
    return { bytes, pageCount: album.spreads.length };
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
