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

function fontBytes(specifier: string): Promise<Buffer> {
  let cached = bytesCache.get(specifier);
  if (!cached) {
    cached = readFile(require.resolve(specifier));
    bytesCache.set(specifier, cached);
  }
  return cached;
}

/** Embeds each face at most once per document, and only the glyphs actually used. */
export class AlbumFonts {
  private readonly embedded = new Map<string, Promise<PDFFont>>();

  constructor(private readonly pdf: PDFDocument) {
    pdf.registerFontkit(fontkit);
  }

  get(font: AlbumFont, size: TextSize): Promise<PDFFont> {
    const specifier = FILES[font][isStrong(size) ? "strong" : "regular"];
    let cached = this.embedded.get(specifier);
    if (!cached) {
      cached = fontBytes(specifier).then((bytes) => this.pdf.embedFont(bytes, { subset: true }));
      this.embedded.set(specifier, cached);
    }
    return cached;
  }
}

/**
 * Greedy word wrap to `maxWidth`, keeping the line breaks the photographer typed. A single
 * word wider than the box is left on its own line rather than broken mid-word.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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
