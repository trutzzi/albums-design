import type { PhotoCategoryName } from "../../domain/value-objects/photo-category";
import type { ImageMetrics } from "../../application/ports/image-inspector";
import type { VisionClassifier, VisionVerdict } from "../../application/ports/vision-classifier";

/**
 * Zero-dependency fallback so the pipeline runs with no vision API key configured.
 * It is deliberately conservative: confidence never exceeds 0.5, which downstream
 * album generation uses to avoid leaning on categories it cannot trust.
 */
export class HeuristicVisionClassifier implements VisionClassifier {
  async classify(input: { metrics: ImageMetrics }): Promise<VisionVerdict> {
    const { metrics } = input;
    const peopleLikely = metrics.skinToneRatio > 0.06;
    const crowdLikely = metrics.skinToneRatio > 0.18;
    const isCloseUp = metrics.composition > 65 && metrics.saturation > 0.35;

    let category: PhotoCategoryName;
    if (crowdLikely) category = "GROUP";
    else if (peopleLikely) category = metrics.width > metrics.height ? "CANDID" : "PORTRAIT";
    else if (isCloseUp) category = "DETAIL";
    else category = "VENUE";

    const faceCount = crowdLikely ? 4 : peopleLikely ? 1 : 0;

    return {
      category,
      confidence: peopleLikely ? 0.45 : 0.3,
      faceCount,
      faceQuality: faceCount > 0 ? Math.round(metrics.sharpness * 0.9) : 0,
    };
  }
}
