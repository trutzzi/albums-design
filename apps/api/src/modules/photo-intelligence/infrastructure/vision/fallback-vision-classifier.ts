import type { VisionClassifier, VisionVerdict } from "../../application/ports/vision-classifier";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";

/**
 * Wraps a classifier that depends on something outside this process (a local
 * AI server, a cloud API) with a classifier that never fails on its own — a
 * photo upload should never break just because the Mac mini is asleep or
 * unplugged. `isAvailable()` still reports the primary's real state, since
 * that's what the "AI online/offline" indicator is built on; only `classify()`
 * falls back, with a warning so a provider that is down for good is noticed.
 */
export class FallbackVisionClassifier implements VisionClassifier {
  constructor(
    private readonly primary: VisionClassifier,
    private readonly fallback: VisionClassifier,
    private readonly logger: Logger = consoleLogger,
  ) {}

  async classify(input: Parameters<VisionClassifier["classify"]>[0]): Promise<VisionVerdict> {
    try {
      return await this.primary.classify(input);
    } catch (error) {
      this.logger.warn("vision provider failed; classified with the fallback", { err: error });
      return this.fallback.classify(input);
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.primary.isAvailable();
  }
}
