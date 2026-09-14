import { eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import type { PhotoAnalysisRepository } from "../../domain/photo-analysis-repository";
import { PhotoAnalysis } from "../../domain/photo-analysis";
import { QualityScore } from "../../domain/value-objects/quality-score";
import { photoAnalyses } from "./schema";

export class DrizzlePhotoAnalysisRepository implements PhotoAnalysisRepository {
  constructor(private readonly db: Database) {}

  async save(analysis: PhotoAnalysis): Promise<void> {
    const components = analysis.score.components;
    const row = {
      id: analysis.id.toString(),
      photoId: analysis.photoId.toString(),
      projectId: analysis.projectId.toString(),
      overallScore: analysis.score.overall,
      sharpness: components.sharpness,
      exposure: components.exposure,
      composition: components.composition,
      faceQuality: components.faceQuality,
      category: analysis.category,
      categoryConfidence: analysis.categoryConfidence,
      orientation: analysis.orientation,
      width: analysis.width,
      height: analysis.height,
      faceCount: analysis.faceCount,
      capturedAt: analysis.capturedAt ?? null,
      analyzedAt: analysis.analyzedAt,
    };

    await this.db
      .insert(photoAnalyses)
      .values(row)
      .onConflictDoUpdate({ target: photoAnalyses.photoId, set: row });
  }

  async findByPhotoId(photoId: UniqueEntityId): Promise<PhotoAnalysis | undefined> {
    const [row] = await this.db
      .select()
      .from(photoAnalyses)
      .where(eq(photoAnalyses.photoId, photoId.toString()))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findByProjectId(projectId: UniqueEntityId): Promise<PhotoAnalysis[]> {
    const rows = await this.db
      .select()
      .from(photoAnalyses)
      .where(eq(photoAnalyses.projectId, projectId.toString()));
    return rows.map(toDomain);
  }
}

function toDomain(row: typeof photoAnalyses.$inferSelect): PhotoAnalysis {
  return PhotoAnalysis.reconstitute(
    {
      photoId: UniqueEntityId.create(row.photoId),
      projectId: UniqueEntityId.create(row.projectId),
      score: QualityScore.fromComponents({
        sharpness: row.sharpness,
        exposure: row.exposure,
        composition: row.composition,
        faceQuality: row.faceQuality,
      }),
      category: row.category,
      categoryConfidence: row.categoryConfidence,
      orientation: row.orientation,
      width: row.width,
      height: row.height,
      faceCount: row.faceCount,
      capturedAt: row.capturedAt ?? undefined,
      analyzedAt: row.analyzedAt,
    },
    UniqueEntityId.create(row.id),
  );
}
