import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { PhotoAnalysisRepository } from "../../domain/photo-analysis-repository";
import { groupBySimilarity } from "../../domain/photo-similarity";
import type { VisionClassifier } from "../../application/ports/vision-classifier";

const projectParams = z.object({ projectId: z.string().uuid() });

export interface PhotoIntelligenceDependencies {
  analyses: PhotoAnalysisRepository;
  visionClassifier: VisionClassifier;
}

export function registerPhotoIntelligenceRoutes(
  app: FastifyInstance,
  deps: PhotoIntelligenceDependencies,
): void {
  // Polled by the frontend to show whether AI-backed photo analysis is
  // actually reachable right now (relevant once VISION_PROVIDER is "ollama" —
  // a heuristic or cloud classifier is never "offline" in a way worth
  // surfacing, so this just reports whatever the configured classifier says).
  app.get("/ai/status", async () => ({ available: await deps.visionClassifier.isAvailable() }));

  app.get("/projects/:projectId/analyses", async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const analyses = await deps.analyses.findByProjectId(UniqueEntityId.create(projectId));
    const groupByPhotoId = groupBySimilarity(
      analyses.map((analysis) => ({
        photoId: analysis.photoId.toString(),
        histogram: analysis.histogram,
        capturedAt: analysis.capturedAt,
      })),
    );
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
        similarityGroup: groupByPhotoId.get(analysis.photoId.toString()) ?? 0,
      }));
  });
}
