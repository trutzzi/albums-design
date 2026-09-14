import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ProjectRepository } from "../../../media-ingestion/domain/project-repository";
import type { PhotoAnalysisRepository } from "../../../photo-intelligence/domain/photo-analysis-repository";
import type { CandidatePhoto } from "../../domain/layout-planner";
import type {
  AnalysedPhotoDirectory,
  ProjectDirectory,
  ProjectSummary,
} from "../../application/ports/directories";

export class MediaIngestionProjectDirectory implements ProjectDirectory {
  constructor(private readonly projects: ProjectRepository) {}

  async findProject(projectId: string): Promise<ProjectSummary | undefined> {
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    if (!project) return undefined;
    return {
      projectId: project.id.toString(),
      studioId: project.studioId.toString(),
      name: project.name,
    };
  }
}

export class PhotoIntelligenceDirectory implements AnalysedPhotoDirectory {
  constructor(private readonly analyses: PhotoAnalysisRepository) {}

  async listForProject(projectId: string): Promise<CandidatePhoto[]> {
    const analyses = await this.analyses.findByProjectId(UniqueEntityId.create(projectId));
    return analyses.map((analysis) => ({
      photoId: analysis.photoId.toString(),
      score: analysis.score.overall,
      category: analysis.category,
      orientation: analysis.orientation,
      capturedAt: analysis.timelinePosition,
    }));
  }
}
