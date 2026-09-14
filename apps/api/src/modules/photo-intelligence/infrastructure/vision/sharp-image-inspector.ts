import sharp from "sharp";
import type { ImageInspector, ImageMetrics } from "../../application/ports/image-inspector";

const ANALYSIS_EDGE = 512;

export class SharpImageInspector implements ImageInspector {
  async inspect(bytes: Uint8Array): Promise<ImageMetrics> {
    const image = sharp(Buffer.from(bytes), { failOn: "none" });
    const metadata = await image.metadata();

    const { data: grey, info } = await image
      .clone()
      .rotate()
      .greyscale()
      .resize(ANALYSIS_EDGE, ANALYSIS_EDGE, { fit: "inside", withoutEnlargement: false })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data: rgb } = await image
      .clone()
      .rotate()
      .resize(128, 128, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const energy = gradientMagnitude(grey, info.width, info.height);

    return {
      width: metadata.width ?? info.width,
      height: metadata.height ?? info.height,
      sharpness: scoreSharpness(laplacianVariance(grey, info.width, info.height)),
      exposure: scoreExposure(grey),
      composition: scoreComposition(energy, info.width, info.height),
      saturation: meanSaturation(rgb),
      skinToneRatio: skinToneRatio(rgb),
      capturedAt: parseExifDate(metadata.exif),
    };
  }
}

/** Variance of the Laplacian — the standard blur metric. Flat images have near-zero response. */
export function laplacianVariance(grey: Uint8Array, width: number, height: number): number {
  const responses: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value =
        -4 * (grey[i] ?? 0) +
        (grey[i - 1] ?? 0) +
        (grey[i + 1] ?? 0) +
        (grey[i - width] ?? 0) +
        (grey[i + width] ?? 0);
      responses.push(value);
    }
  }
  if (responses.length === 0) return 0;
  const mean = responses.reduce((sum, v) => sum + v, 0) / responses.length;
  return responses.reduce((sum, v) => sum + (v - mean) ** 2, 0) / responses.length;
}

export function scoreSharpness(variance: number): number {
  // Saturating curve: ~300 variance is tack sharp, <20 is unusable.
  return Math.round(100 * (1 - Math.exp(-variance / 120)));
}

export function scoreExposure(grey: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < grey.length; i += 1) {
    const value = grey[i] ?? 0;
    histogram[value] = (histogram[value] ?? 0) + 1;
  }
  const total = grey.length || 1;
  let sum = 0;
  for (let v = 0; v < 256; v += 1) sum += v * (histogram[v] ?? 0);
  const mean = sum / total / 255;

  const shadowClip = ((histogram[0] ?? 0) + (histogram[1] ?? 0) + (histogram[2] ?? 0)) / total;
  const highlightClip =
    ((histogram[253] ?? 0) + (histogram[254] ?? 0) + (histogram[255] ?? 0)) / total;

  const midtoneScore = 100 * (1 - Math.abs(mean - 0.46) * 2.2);
  const clipPenalty = (shadowClip + highlightClip) * 160;
  return Math.round(Math.min(100, Math.max(0, midtoneScore - clipPenalty)));
}

export function gradientMagnitude(grey: Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = (grey[i + 1] ?? 0) - (grey[i - 1] ?? 0);
      const gy = (grey[i + width] ?? 0) - (grey[i - width] ?? 0);
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/**
 * Rewards images whose visual weight sits near rule-of-thirds intersections rather
 * than dead centre or jammed against an edge.
 */
export function scoreComposition(energy: Float32Array, width: number, height: number): number {
  let total = 0;
  let weighted = 0;
  const targets = [
    [width / 3, height / 3],
    [(2 * width) / 3, height / 3],
    [width / 3, (2 * height) / 3],
    [(2 * width) / 3, (2 * height) / 3],
  ];
  const radius = Math.min(width, height) / 4;

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const value = energy[y * width + x] ?? 0;
      if (value <= 0) continue;
      total += value;
      const nearest = Math.min(...targets.map(([tx, ty]) => Math.hypot(x - (tx ?? 0), y - (ty ?? 0))));
      if (nearest < radius) weighted += value * (1 - nearest / radius);
    }
  }
  if (total === 0) return 40;
  const concentration = weighted / total;
  return Math.round(Math.min(100, 35 + concentration * 190));
}

export function meanSaturation(rgb: Uint8Array): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const r = rgb[i] ?? 0;
    const g = rgb[i + 1] ?? 0;
    const b = rgb[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 0) sum += (max - min) / max;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/** Classic RGB skin-tone gate — weak on its own, useful as a "people present" prior. */
export function skinToneRatio(rgb: Uint8Array): number {
  let hits = 0;
  let count = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const r = rgb[i] ?? 0;
    const g = rgb[i + 1] ?? 0;
    const b = rgb[i + 2] ?? 0;
    count += 1;
    const isSkin =
      r > 95 &&
      g > 40 &&
      b > 20 &&
      r > g &&
      r > b &&
      Math.abs(r - g) > 15 &&
      Math.max(r, g, b) - Math.min(r, g, b) > 15;
    if (isSkin) hits += 1;
  }
  return count === 0 ? 0 : hits / count;
}

function parseExifDate(exif: Buffer | undefined): Date | undefined {
  if (!exif) return undefined;
  const text = exif.toString("latin1");
  const match = text.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
