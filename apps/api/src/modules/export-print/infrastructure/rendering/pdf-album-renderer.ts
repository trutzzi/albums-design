import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AlbumFonts } from "./album-fonts";
import { layoutAlbum, placeWatermark, setTextBlock, type Box, type DrawOp, type Rgb } from "./album-layout";
import { rasterisePhoto } from "./photo-raster";
import type { PrintProfile } from "../../domain/print-profile";
import type {
  AlbumPdfRenderer,
  PhotoResolver,
  RenderResult,
  RenderableAlbum,
} from "../../application/ports/album-pdf-renderer";

const POINTS_PER_INCH = 72;

/**
 * Paints the album's layout (album-layout.ts) as a print PDF: the same layout model the
 * on-screen editor renders, so the file cannot drift from the approved preview. sharp
 * does the pixel work (crop, cover-fit, resample to the profile's dpi); pdf-lib only
 * places boxes. The JPG export paints the very same layout.
 */
export class PdfAlbumRenderer implements AlbumPdfRenderer {
  constructor(private readonly photos: PhotoResolver) {}

  async render(album: RenderableAlbum, profile: PrintProfile): Promise<RenderResult> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(album.title);
    pdf.setProducer("AlbumFlow");
    pdf.setCreator("AlbumFlow");
    const fonts = new AlbumFonts(pdf);
    const watermarkFont = album.watermark ? await pdf.embedFont(StandardFonts.HelveticaBold) : undefined;

    for (const laidOut of layoutAlbum(album, profile, { trimMarks: profile.drawTrimMarks })) {
      const { width, height, bleed } = laidOut;
      const page = pdf.addPage([width, height]);
      page.setMediaBox(0, 0, width, height);
      page.setBleedBox(0, 0, width, height);
      page.setTrimBox(bleed, bleed, width - bleed * 2, height - bleed * 2);
      for (const op of laidOut.ops) await this.paint(pdf, page, op, fonts, watermarkFont, profile.dpi);
    }

    const bytes = await pdf.save();
    return { bytes, pageCount: pdf.getPageCount() };
  }

  private async paint(
    pdf: PDFDocument,
    page: PDFPage,
    op: DrawOp,
    fonts: AlbumFonts,
    watermarkFont: PDFFont | undefined,
    dpi: number,
  ): Promise<void> {
    const pageHeight = page.getHeight();
    // The layout's origin is top-left; PDF user space is bottom-left.
    const flip = (box: Box) => ({ x: box.x, y: pageHeight - box.y - box.height, width: box.width, height: box.height });
    switch (op.kind) {
      case "fill":
        page.drawRectangle({
          ...flip(op.box),
          color: pdfColour(op.color),
          ...(op.opacity !== undefined ? { opacity: op.opacity } : {}),
        });
        return;
      case "stroke":
        page.drawRectangle({
          ...flip(op.box),
          borderColor: pdfColour(op.color),
          borderWidth: op.width,
          borderOpacity: op.opacity,
        });
        return;
      case "image": {
        const jpeg = await rasterisePhoto(
          this.photos,
          op.placement,
          {
            width: Math.round((op.box.width / POINTS_PER_INCH) * dpi),
            height: Math.round((op.box.height / POINTS_PER_INCH) * dpi),
          },
          op.focus,
          "jpeg",
        );
        if (jpeg) page.drawImage(await pdf.embedJpg(jpeg), flip(op.box));
        return;
      }
      case "text": {
        const font = await fonts.get(op.font, op.block.size);
        const { size, lines } = setTextBlock(op.block, op.area, font);
        for (const line of lines) {
          page.drawText(line.text, {
            x: line.x,
            y: pageHeight - line.baseline,
            size,
            font,
            color: pdfColour(op.color),
          });
        }
        return;
      }
      case "watermark": {
        if (!watermarkFont) return;
        const { x, baseline, size, angle } = placeWatermark(op.text, watermarkFont, page.getWidth(), pageHeight);
        const rotate = degrees((angle * 180) / Math.PI);
        const y = pageHeight - baseline;
        // A soft dark shadow under light text reads on both bright and dark photos.
        page.drawText(op.text, {
          x: x + size * 0.02,
          y: y - size * 0.02,
          size,
          font: watermarkFont,
          color: rgb(0, 0, 0),
          opacity: 0.18,
          rotate,
        });
        page.drawText(op.text, { x, y, size, font: watermarkFont, color: rgb(1, 1, 1), opacity: 0.45, rotate });
        return;
      }
      case "line":
        page.drawLine({
          start: { x: op.from.x, y: pageHeight - op.from.y },
          end: { x: op.to.x, y: pageHeight - op.to.y },
          thickness: op.width,
          color: pdfColour(op.color),
        });
        return;
    }
  }
}

function pdfColour(colour: Rgb) {
  return rgb(colour.r, colour.g, colour.b);
}
