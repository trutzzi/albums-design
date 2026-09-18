import type { VisionClassifier, VisionVerdict } from "../../application/ports/vision-classifier";

/**
 * Wraps a classifier that depends on something outside this process (a local
 * AI server, a cloud API) with a classifier that never fails on its own — a
 * photo upload should never break just because the Mac mini is asleep or
 * unplugged. `isAvailable()` still reports the primary's real state, since
 * that's what the "AI online/offline" indicator is built on; only `classify()`
 * falls back silently.
 */
export class FallbackVisionClassifier implements VisionClassifier {
  constructor(
    private readonly primary: VisionClassifier,
    private readonly fallback: VisionClassifier,
  ) {}

  async classify(input: Parameters<VisionClassifier["classify"]>[0]): Promise<VisionVerdict> {
    try {
      return await this.primary.classify(input);
    } catch {
      return this.fallback.classify(input);
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.primary.isAvailable();
  }
}
