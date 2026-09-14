import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoAnalysis } from "./photo-analysis";

export interface PhotoAnalysisRepository {
  save(analysis: PhotoAnalysis): Promise<void>;
  findByPhotoId(photoId: UniqueEntityId): Promise<PhotoAnalysis | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<PhotoAnalysis[]>;
}
