import { AnalyzePhotoUseCase } from "../modules/photo-intelligence/application/use-cases/analyze-photo/analyze-photo.use-case";
import { RecordAnalysisFailureUseCase } from "../modules/photo-intelligence/application/use-cases/record-analysis-failure/record-analysis-failure.use-case";
import { SharpImageInspector } from "../modules/photo-intelligence/infrastructure/vision/sharp-image-inspector";
import { HeuristicVisionClassifier } from "../modules/photo-intelligence/infrastructure/vision/heuristic-vision-classifier";
import { buildVisionClassifier } from "../modules/photo-intelligence/infrastructure/vision/build-vision-classifier";
import { MediaIngestionPhotoLifecycle } from "../modules/photo-intelligence/infrastructure/gateways/photo-lifecycle-gateway";
import { AnalysisPhotoFocusDirectory } from "../modules/photo-intelligence/infrastructure/gateways/photo-focus-directory";
import { AnalysisPhotoDimensionsDirectory } from "../modules/photo-intelligence/infrastructure/gateways/photo-dimensions-directory";
import type { ModuleInfrastructure, Repositories } from "./ports";

/** Photo intelligence: scoring and categorising each upload, and where its subject sits. */
export function buildPhotoIntelligenceModule(
  { env, logger, byteSource }: ModuleInfrastructure,
  { analyses, photos }: Repositories,
) {
  const visionClassifier = buildVisionClassifier({
    provider: env.VISION_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    ollamaModel: env.OLLAMA_MODEL,
    logger: logger.child({ component: "vision" }),
  });
  const lifecycle = new MediaIngestionPhotoLifecycle(photos);
  return {
    visionClassifier,
    analyzePhoto: new AnalyzePhotoUseCase(
      analyses,
      byteSource,
      new SharpImageInspector(),
      new HeuristicVisionClassifier(),
      visionClassifier,
      lifecycle,
    ),
    /** Run by the job runner when an analysis job fails its last attempt. */
    recordAnalysisFailure: new RecordAnalysisFailureUseCase(lifecycle),
    /** Subject positions, read by review and export so an untouched crop frames the subject. */
    photoFocus: new AnalysisPhotoFocusDirectory(analyses),
    /** Upright photo sizes, read by the client galleries to lay photos out uncropped. */
    photoDimensions: new AnalysisPhotoDimensionsDirectory(analyses),
  };
}

export type PhotoIntelligenceModule = ReturnType<typeof buildPhotoIntelligenceModule>;
