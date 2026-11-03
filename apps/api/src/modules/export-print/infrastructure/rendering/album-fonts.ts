import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import type { AlbumFont, TextSize } from "@albumflow/contracts";

const require = createRequire(import.meta.url);

/**
 * IBM Plex, the same family the editor shows on screen, so words wrap the same in the
 * printed file as in the preview. Embedded rather than PDF's built-in fonts because
 * those cannot encode ș, ț or ă — every Romanian album would lose its diacritics.
 */
const FILES: Record<AlbumFont, { regular: string; strong: string }> = {
  serif: {
    regular: "@ibm/plex-serif/fonts/complete/woff/IBMPlexSerif-Regular.woff",
    strong: "@ibm/plex-serif/fonts/complete/woff/IBMPlexSerif-Regular.woff",
  },
  sans: {
    regular: "@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff",
    strong: "@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-SemiBold.woff",
  },
};

/** Headings and titles in the sans face are set heavier; the serif reads best at one weight. */
export function isStrong(size: TextSize): boolean {
  return size === "heading" || size === "title";
}

const bytesCache = new Map<string, Promise<Buffer>>();

export function fontBytes(specifier: string): Promise<Buffer> {
  let cached = bytesCache.get(specifier);
  if (!cached) {
    cached = readFile(require.resolve(specifier));
    bytesCache.set(specifier, cached);
  }
  return cached;
}

export function fontSpecifier(font: AlbumFont, size: TextSize): string {
  return FILES[font][isStrong(size) ? "strong" : "regular"];
}

/** Embeds each face at most once per document, and only the glyphs actually used. */
export class AlbumFonts {
  private readonly embedded = new Map<string, Promise<PDFFont>>();

  constructor(private readonly pdf: PDFDocument) {
    pdf.registerFontkit(fontkit);
  }

  get(font: AlbumFont, size: TextSize): Promise<PDFFont> {
    const specifier = fontSpecifier(font, size);
    let cached = this.embedded.get(specifier);
    if (!cached) {
      cached = fontBytes(specifier).then((bytes) => this.pdf.embedFont(bytes, { subset: true }));
      this.embedded.set(specifier, cached);
    }
    return cached;
  }
}

interface FontkitGlyph {
  advanceWidth: number;
  path: { toSVG(): string };
}
interface FontkitFont {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  layout(text: string): { glyphs: FontkitGlyph[] };
}

/**
 * The same IBM Plex face for the JPG export, where words are drawn as outlines. Widths are
 * each glyph's advance in turn, exactly as pdf-lib measures and sets them, so a line wraps
 * and sits identically in the PDF and the JPG.
 */
export class RasterFont {
  private constructor(private readonly font: FontkitFont) {}

  static async load(font: AlbumFont, size: TextSize): Promise<RasterFont> {
    return new RasterFont(fontkit.create(await fontBytes(fontSpecifier(font, size))) as unknown as FontkitFont);
  }

  widthOfTextAtSize(text: string, size: number): number {
    const advance = this.font.layout(text).glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth, 0);
    return (advance * size) / this.font.unitsPerEm;
  }

  heightAtSize(size: number): number {
    return ((this.font.ascent - this.font.descent) * size) / this.font.unitsPerEm;
  }

  /** SVG path elements for `text` with its baseline starting at (x, baseline), in the page's units. */
  outline(text: string, x: number, baseline: number, size: number): string {
    const scale = size / this.font.unitsPerEm;
    let cursor = x;
    const paths: string[] = [];
    for (const glyph of this.font.layout(text).glyphs) {
      const d = glyph.path.toSVG();
      // Font units point up; the page's point down.
      if (d) paths.push(`<path transform="translate(${cursor} ${baseline}) scale(${scale} ${-scale})" d="${d}"/>`);
      cursor += glyph.advanceWidth * scale;
    }
    return paths.join("");
  }
}
