import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { ZipArchive } from "archiver";
import sharp, { type OverlayOptions } from "sharp";
import { RasterFont } from "./album-fonts";
import { layoutAlbum, placeWatermark, setTextBlock, type DrawOp, type LaidOutPage, type Rgb } from "./album-layout";
import { rasterisePhoto } from "./photo-raster";
import type { PrintProfile } from "../../domain/print-profile";
import type { AlbumJpegRenderer, PhotoResolver, RenderableAlbum } from "../../application/ports/album-pdf-renderer";

const POINTS_PER_INCH = 72;
/** Labs ask for "highest quality": 100, and every pixel keeps its own colour (no subsampling). */
const JPEG_QUALITY = 100;

/**
 * The album as one JPG per spread (and one for the cover), for labs that take images
 * rather than PDFs. It paints the same layout as the PDF at the print profile's dpi, bleed
 * included and no trim marks, in sRGB with the profile embedded. Pages are rendered one at
 * a time straight into a ZIP on disk, so a 40-spread album never sits in memory at once.
 */
export class JpegAlbumRenderer implements AlbumJpegRenderer {
  private readonly fonts = new Map<string, Promise<RasterFont>>();

  constructor(private readonly photos: PhotoResolver) {}

  async renderZip(album: RenderableAlbum, profile: PrintProfile, outputPath: string): Promise<{ fileCount: number }> {
    const pages = layoutAlbum(album, profile, { trimMarks: false });
    const output = createWriteStream(outputPath);
    // JPGs are already compressed: storing them saves the CPU of a 1% gain.
    const archive = new ZipArchive({ store: true });
    // Either stream failing (a full disk, say) ends the export at once: every wait below
    // races this, so a job can never hang in "rendering", and both streams always have an
    // error listener, so a write error can never take the worker down.
    const failed = new Promise<never>((_, reject) => {
      archive.on("error", reject);
      output.on("error", reject);
    });
    failed.catch(() => {});
    archive.pipe(output);

    const digits = Math.max(2, String(pages.length).length);
    try {
      for (const page of pages) {
        const jpeg = await Promise.race([this.paint(page, profile.dpi), failed]);
        const name =
          page.name === "cover" ? `${"0".repeat(digits)}_cover.jpg` : `${String(page.name).padStart(digits, "0")}.jpg`;
        // Wait for the archive to take this page before rendering the next one.
        const taken = once(archive, "entry");
        archive.append(jpeg, { name });
        await Promise.race([taken, failed]);
      }
      const finished = output.writableFinished ? Promise.resolve() : once(output, "finish");
      await Promise.race([archive.finalize(), failed]);
      await Promise.race([finished, failed]);
    } catch (error) {
      // A failed export must not leave the archive and its file open: the worker runs
      // export after export, and every leaked descriptor stays until it restarts.
      archive.unpipe(output);
      archive.abort();
      output.destroy();
      throw error;
    }
    return { fileCount: pages.length };
  }

  private async paint(page: LaidOutPage, dpi: number): Promise<Buffer> {
    const scale = dpi / POINTS_PER_INCH;
    const px = (points: number) => Math.round(points * scale);
    const width = px(page.width);
    const height = px(page.height);

    // Photos are their own layers; everything vector between them is one SVG layer in the
    // page's own units, so the layering is exactly the layout's order.
    const layers: OverlayOptions[] = [];
    let vector: string[] = [];
    const flush = () => {
      if (vector.length === 0) return;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${page.width} ${page.height}">${vector.join("")}</svg>`;
      layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
      vector = [];
    };

    for (const op of page.ops) {
      if (op.kind === "image") {
        flush();
        const left = px(op.box.x);
        const top = px(op.box.y);
        // Edges rounded independently, so neighbouring photos meet without a hairline gap.
        const right = Math.min(width, px(op.box.x + op.box.width));
        const bottom = Math.min(height, px(op.box.y + op.box.height));
        const photo = await rasterisePhoto(
          this.photos,
          op.placement,
          { width: right - left, height: bottom - top },
          op.focus,
          "raw",
        );
        if (photo) {
          layers.push({
            input: photo.data,
            raw: { width: photo.width, height: photo.height, channels: photo.channels },
            left,
            top,
          });
        }
      } else {
        vector.push(await this.vector(op, page));
      }
    }
    flush();

    return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite(layers)
      .withIccProfile("srgb")
      .withMetadata({ density: dpi })
      .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" })
      .toBuffer();
  }

  private async vector(op: Exclude<DrawOp, { kind: "image" }>, page: LaidOutPage): Promise<string> {
    switch (op.kind) {
      case "fill":
        return `<rect x="${op.box.x}" y="${op.box.y}" width="${op.box.width}" height="${op.box.height}" fill="${svgColour(op.color)}"${op.opacity !== undefined ? ` fill-opacity="${op.opacity}"` : ""}/>`;
      case "stroke": {
        // PDF strokes centre on the box edge; so does SVG.
        return `<rect x="${op.box.x}" y="${op.box.y}" width="${op.box.width}" height="${op.box.height}" fill="none" stroke="${svgColour(op.color)}" stroke-width="${op.width}" stroke-opacity="${op.opacity}"/>`;
      }
      case "text": {
        const font = await this.font(op.font, op.block.size);
        const { size, lines } = setTextBlock(op.block, op.area, font);
        return `<g fill="${svgColour(op.color)}">${lines.map((line) => font.outline(line.text, line.x, line.baseline, size)).join("")}</g>`;
      }
      case "watermark": {
        // The PDF uses Helvetica Bold; Plex Sans SemiBold is the closest face this has.
        const font = await this.font("sans", "title");
        const { x, baseline, size, angle } = placeWatermark(op.text, font, page.width, page.height);
        const turn = (-angle * 180) / Math.PI;
        const offset = size * 0.02;
        return (
          `<g transform="rotate(${turn} ${x + offset} ${baseline + offset})" fill="#000" fill-opacity="0.18">${font.outline(op.text, x + offset, baseline + offset, size)}</g>` +
          `<g transform="rotate(${turn} ${x} ${baseline})" fill="#fff" fill-opacity="0.45">${font.outline(op.text, x, baseline, size)}</g>`
        );
      }
      case "line":
        return `<line x1="${op.from.x}" y1="${op.from.y}" x2="${op.to.x}" y2="${op.to.y}" stroke="${svgColour(op.color)}" stroke-width="${op.width}"/>`;
    }
  }

  private font(face: Parameters<typeof RasterFont.load>[0], size: Parameters<typeof RasterFont.load>[1]) {
    const key = `${face}:${size}`;
    let cached = this.fonts.get(key);
    if (!cached) {
      cached = RasterFont.load(face, size);
      this.fonts.set(key, cached);
    }
    return cached;
  }
}

function svgColour({ r, g, b }: Rgb): string {
  const channel = (value: number) => Math.round(value * 255);
  return `rgb(${channel(r)},${channel(g)},${channel(b)})`;
}
