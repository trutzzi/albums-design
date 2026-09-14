import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoAnalysisRepository } from "../../domain/photo-analysis-repository";

const projectParams = z.object({ projectId: z.string().uuid() });

export interface PhotoIntelligenceDependencies {
  analyses: PhotoAnalysisRepository;
}

export function registerPhotoIntelligenceRoutes(
  app: FastifyInstance,
  deps: PhotoIntelligenceDependencies,
): void {
  app.get("/projects/:projectId/analyses", async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const analyses = await deps.analyses.findByProjectId(UniqueEntityId.create(projectId));
    return analyses
      .sort((a, b) => b.score.overall - a.score.overall)
      .map((analysis) => ({
        photoId: analysis.photoId.toString(),
        overall: analysis.score.overall,
        components: analysis.score.components,
        category: analysis.category,
        categoryConfidence: analysis.categoryConfidence,
        orientation: analysis.orientation,
        faceCount: analysis.faceCount,
        albumWorthy: analysis.score.isAlbumWorthy,
      }));
  });
}
