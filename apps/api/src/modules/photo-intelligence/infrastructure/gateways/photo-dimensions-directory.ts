import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoDimensions, PhotoDimensionsDirectory } from "../../../../shared-kernel/photo-dimensions";
import type { PhotoAnalysisRepository } from "../../domain/photo-analysis-repository";

/** Reads each photo's upright size from the shoot's analyses. */
export class AnalysisPhotoDimensionsDirectory implements PhotoDimensionsDirectory {
  constructor(private readonly analyses: PhotoAnalysisRepository) {}

  async forProject(projectId: string): Promise<Map<string, PhotoDimensions>> {
    const analyses = await this.analyses.findByProjectId(UniqueEntityId.create(projectId));
    return new Map(
      analyses
        .filter((analysis) => analysis.width > 0 && analysis.height > 0)
        .map((analysis) => [analysis.photoId.toString(), { width: analysis.width, height: analysis.height }]),
    );
  }
}
