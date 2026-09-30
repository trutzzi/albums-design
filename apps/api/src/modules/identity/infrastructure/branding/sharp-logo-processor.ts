import sharp from "sharp";
import type { LogoProcessor } from "../../application/ports/logo-processor";

const ACCEPTED = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_WIDTH = 600;
const MAX_HEIGHT = 200;

/**
 * Accepts PNG, JPEG or WebP (never SVG, which can carry script) and stores it at most
 * 600×200 as PNG, transparency kept — a few kilobytes, fine to keep in the studio row.
 */
export class SharpLogoProcessor implements LogoProcessor {
  async normalise(dataUrl: string): Promise<string> {
    const match = ACCEPTED.exec(dataUrl.trim());
    if (!match) throw new Error("The logo must be a PNG, JPEG or WebP image.");
    const input = Buffer.from(match[2]!, "base64");
    let output: Buffer;
    try {
      output = await sharp(input, { failOn: "error" })
        .rotate()
        .resize(MAX_WIDTH, MAX_HEIGHT, { fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      throw new Error("That file could not be read as an image.");
    }
    return `data:image/png;base64,${output.toString("base64")}`;
  }
}
