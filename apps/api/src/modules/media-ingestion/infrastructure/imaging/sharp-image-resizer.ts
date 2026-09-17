import sharp from "sharp";
import type { ImageResizer, ResizeRequest } from "../../application/ports/image-resizer";

export class SharpImageResizer implements ImageResizer {
  async toJpeg(request: ResizeRequest): Promise<Buffer> {
    return sharp(request.data)
      // `rotate()` with no argument applies the EXIF orientation, so a phone shot
      // is not stored sideways; `inside` preserves the aspect ratio the crop
      // maths assumes.
      .rotate()
      .resize(request.longestEdge, request.longestEdge, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: request.quality, mozjpeg: true })
      .toBuffer();
  }
}
