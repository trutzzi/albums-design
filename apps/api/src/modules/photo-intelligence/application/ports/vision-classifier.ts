import type { PhotoCategoryName } from "../../domain/value-objects/photo-category";
import type { ImageMetrics } from "./image-inspector";

export interface VisionVerdict {
  category: PhotoCategoryName;
  confidence: number;
  faceCount: number;
  /** 0-100 quality of faces present (eyes open, in focus). 0 when no faces. */
  faceQuality: number;
}

export interface VisionClassifier {
  classify(input: { bytes: Uint8Array; metrics: ImageMetrics }): Promise<VisionVerdict>;
  /** Cheap liveness check for a status indicator — must never throw. */
  isAvailable(): Promise<boolean>;
}
