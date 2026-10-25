import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoTraits, PhotoTraitsDirectory } from "#src/shared-kernel/photo-traits";
import type { PhotoAnalysisRepository } from "../../domain/photo-analysis-repository";

/** Reads each photo's category and overall score from the shoot's analyses. */
export class AnalysisPhotoTraitsDirectory implements PhotoTraitsDirectory {
  constructor(private readonly analyses: PhotoAnalysisRepository) {}

  async forProject(projectId: string): Promise<Map<string, PhotoTraits>> {
    const analyses = await this.analyses.findByProjectId(UniqueEntityId.create(projectId));
    return new Map(
      analyses.map((analysis) => [
        analysis.photoId.toString(),
        { category: analysis.category, score: analysis.score.overall },
      ]),
    );
  }
}
