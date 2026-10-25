import sharp from "sharp";
import type { TeaserImages } from "../../application/ports/cover-teaser";

/** Wide enough for the colours and light of the cover, too small to show a face. */
export const TEASER_WIDTH = 32;

export class SharpTeaserImages implements TeaserImages {
  async shrink(image: Buffer): Promise<Buffer> {
    return sharp(image)
      .rotate()
      .resize({ width: TEASER_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 50 })
      .toBuffer();
  }
}
