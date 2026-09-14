import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import type { ApplicationError } from "../../../../../shared-kernel/errors";
import { PhotoAnalysis } from "../../../domain/photo-analysis";
import type { PhotoAnalysisRepository } from "../../../domain/photo-analysis-repository";
import type { ImageInspector } from "../../ports/image-inspector";
import type { VisionClassifier } from "../../ports/vision-classifier";
import type { PhotoByteSource } from "../../ports/photo-source";
import type { PhotoLifecycle } from "../../ports/photo-lifecycle";

export interface AnalyzePhotoCommand {
  photoId: string;
  projectId: string;
  storageKey: string;
}

export class AnalyzePhotoUseCase {
  constructor(
    private readonly analyses: PhotoAnalysisRepository,
    private readonly bytes: PhotoByteSource,
    private readonly inspector: ImageInspector,
    private readonly classifier: VisionClassifier,
    private readonly lifecycle: PhotoLifecycle,
  ) {}

  async execute(command: AnalyzePhotoCommand): Promise<Result<PhotoAnalysis, ApplicationError>> {
    const buffer = await this.bytes.read(command.storageKey);
    const metrics = await this.inspector.inspect(buffer);
    const verdict = await this.classifier.classify({ bytes: buffer, metrics });

    const analysis = PhotoAnalysis.record({
      photoId: UniqueEntityId.create(command.photoId),
      projectId: UniqueEntityId.create(command.projectId),
      components: {
        sharpness: metrics.sharpness,
        exposure: metrics.exposure,
        composition: metrics.composition,
        faceQuality: verdict.faceCount > 0 ? verdict.faceQuality : neutralFaceScore(metrics),
      },
      category: verdict.category,
      categoryConfidence: verdict.confidence,
      width: metrics.width,
      height: metrics.height,
      faceCount: verdict.faceCount,
      capturedAt: metrics.capturedAt,
    });

    await this.analyses.save(analysis);
    await this.lifecycle.markAnalysed(command.photoId);
    return Result.success(analysis);
  }
}

/**
 * Photos without faces (details, venues) must not be punished on the face axis,
 * or every ring shot would score below every mediocre portrait.
 */
function neutralFaceScore(metrics: { sharpness: number }): number {
  return Math.min(75, Math.max(50, metrics.sharpness));
}
