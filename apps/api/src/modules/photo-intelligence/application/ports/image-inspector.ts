export interface ImageMetrics {
  width: number;
  height: number;
  /** 0-100, derived from Laplacian variance — the classical blur detector. */
  sharpness: number;
  /** 0-100, midtone balance penalised for clipped shadows/highlights. */
  exposure: number;
  /** 0-100, how well image energy lands on rule-of-thirds intersections. */
  composition: number;
  /** Mean saturation 0-1, used as a weak signal for detail vs. venue shots. */
  saturation: number;
  /** Fraction of pixels in the skin-tone gamut 0-1 — a cheap proxy for "people are in this frame". */
  skinToneRatio: number;
  capturedAt: Date | undefined;
  /**
   * A coarse RGB color histogram (8 buckets per channel, 24 values, each the
   * fraction of pixels landing in that bucket) — the fingerprint similarity
   * grouping compares between photos to find ones shot in the same setting.
   */
  histogram: number[];
}

export interface ImageInspector {
  inspect(bytes: Uint8Array): Promise<ImageMetrics>;
}
