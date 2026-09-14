import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import { QualityScore, type QualityComponents } from "./value-objects/quality-score";
import type { PhotoCategoryName } from "./value-objects/photo-category";

export type Orientation = "LANDSCAPE" | "PORTRAIT" | "SQUARE";

export interface PhotoAnalysisProps {
  photoId: UniqueEntityId;
  projectId: UniqueEntityId;
  score: QualityScore;
  category: PhotoCategoryName;
  categoryConfidence: number;
  orientation: Orientation;
  width: number;
  height: number;
  faceCount: number;
  capturedAt: Date | undefined;
  analyzedAt: Date;
}

export class PhotoAnalysis extends AggregateRoot<PhotoAnalysisProps> {
  private constructor(props: PhotoAnalysisProps, id: UniqueEntityId) {
    super(props, id);
  }

  static record(
    params: {
      photoId: UniqueEntityId;
      projectId: UniqueEntityId;
      components: QualityComponents;
      category: PhotoCategoryName;
      categoryConfidence: number;
      width: number;
      height: number;
      faceCount: number;
      capturedAt?: Date | undefined;
      analyzedAt?: Date;
    },
    id?: UniqueEntityId,
  ): PhotoAnalysis {
    return new PhotoAnalysis(
      {
        photoId: params.photoId,
        projectId: params.projectId,
        score: QualityScore.fromComponents(params.components),
        category: params.category,
        categoryConfidence: params.categoryConfidence,
        orientation: orientationOf(params.width, params.height),
        width: params.width,
        height: params.height,
        faceCount: params.faceCount,
        capturedAt: params.capturedAt,
        analyzedAt: params.analyzedAt ?? new Date(),
      },
      id ?? UniqueEntityId.create(),
    );
  }

  static reconstitute(props: PhotoAnalysisProps, id: UniqueEntityId): PhotoAnalysis {
    return new PhotoAnalysis(props, id);
  }

  get photoId(): UniqueEntityId {
    return this.props.photoId;
  }

  get projectId(): UniqueEntityId {
    return this.props.projectId;
  }

  get score(): QualityScore {
    return this.props.score;
  }

  get category(): PhotoCategoryName {
    return this.props.category;
  }

  get categoryConfidence(): number {
    return this.props.categoryConfidence;
  }

  get orientation(): Orientation {
    return this.props.orientation;
  }

  get width(): number {
    return this.props.width;
  }

  get height(): number {
    return this.props.height;
  }

  get aspectRatio(): number {
    return this.props.height === 0 ? 1 : this.props.width / this.props.height;
  }

  get faceCount(): number {
    return this.props.faceCount;
  }

  get capturedAt(): Date | undefined {
    return this.props.capturedAt;
  }

  get analyzedAt(): Date {
    return this.props.analyzedAt;
  }

  /** Ordering key for building a chronological narrative — falls back to analysis time. */
  get timelinePosition(): number {
    return (this.props.capturedAt ?? this.props.analyzedAt).getTime();
  }
}

export function orientationOf(width: number, height: number): Orientation {
  if (width === height) return "SQUARE";
  const ratio = width / height;
  if (ratio > 0.95 && ratio < 1.05) return "SQUARE";
  return ratio > 1 ? "LANDSCAPE" : "PORTRAIT";
}
