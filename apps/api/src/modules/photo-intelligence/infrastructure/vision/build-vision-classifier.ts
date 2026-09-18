import { AnthropicVisionClassifier } from "./anthropic-vision-classifier";
import { FallbackVisionClassifier } from "./fallback-vision-classifier";
import { HeuristicVisionClassifier } from "./heuristic-vision-classifier";
import { OllamaVisionClassifier } from "./ollama-vision-classifier";
import type { VisionClassifier } from "../../application/ports/vision-classifier";

export interface VisionClassifierConfig {
  provider: "heuristic" | "anthropic" | "ollama";
  anthropicApiKey?: string | undefined;
  ollamaBaseUrl?: string | undefined;
  ollamaModel?: string | undefined;
}

/**
 * The one place that turns `VISION_PROVIDER` into a real classifier — shared
 * by the production composition root and the demo server so both pick the
 * same way instead of drifting apart.
 */
export function buildVisionClassifier(config: VisionClassifierConfig): VisionClassifier {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicVisionClassifier({ apiKey: config.anthropicApiKey });
    case "ollama":
      // Wrapped in a fallback: a photo upload must not break just because the
      // local AI server is unreachable — it degrades to the heuristic instead.
      return new FallbackVisionClassifier(
        new OllamaVisionClassifier({ baseUrl: config.ollamaBaseUrl, model: config.ollamaModel }),
        new HeuristicVisionClassifier(),
      );
    case "heuristic":
    default:
      return new HeuristicVisionClassifier();
  }
}
