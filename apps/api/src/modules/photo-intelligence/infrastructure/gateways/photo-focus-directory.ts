import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoFocus } from "@albumflow/contracts";
import type { PhotoFocusDirectory } from "../../../../shared-kernel/photo-focus";
import type { PhotoAnalysisRepository } from "../../domain/photo-analysis-repository";

/** Reads subject points from the shoot's analyses; photos analysed before they existed are left out. */
export class AnalysisPhotoFocusDirectory implements PhotoFocusDirectory {
  constructor(private readonly analyses: PhotoAnalysisRepository) {}

  async forProject(projectId: string): Promise<Map<string, PhotoFocus>> {
    const analyses = await this.analyses.findByProjectId(UniqueEntityId.create(projectId));
    const focus = new Map<string, PhotoFocus>();
    for (const analysis of analyses) {
      if (analysis.focus) focus.set(analysis.photoId.toString(), analysis.focus);
    }
    return focus;
  }
}
