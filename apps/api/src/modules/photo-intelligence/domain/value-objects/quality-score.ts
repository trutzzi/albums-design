import { ValueObject } from "@albumflow/domain-kernel";

export interface QualityComponents {
  sharpness: number;
  exposure: number;
  composition: number;
  faceQuality: number;
}

const WEIGHTS: Record<keyof QualityComponents, number> = {
  sharpness: 0.35,
  exposure: 0.25,
  composition: 0.2,
  faceQuality: 0.2,
};

export class QualityScore extends ValueObject<QualityComponents & { overall: number }> {
  private constructor(props: QualityComponents & { overall: number }) {
    super(props);
  }

  static fromComponents(components: QualityComponents): QualityScore {
    const clamped: QualityComponents = {
      sharpness: clamp(components.sharpness),
      exposure: clamp(components.exposure),
      composition: clamp(components.composition),
      faceQuality: clamp(components.faceQuality),
    };
    const overall = Math.round(
      (Object.keys(WEIGHTS) as (keyof QualityComponents)[]).reduce(
        (sum, key) => sum + clamped[key] * WEIGHTS[key],
        0,
      ),
    );
    return new QualityScore({ ...clamped, overall });
  }

  get overall(): number {
    return this.props.overall;
  }

  get components(): QualityComponents {
    return {
      sharpness: this.props.sharpness,
      exposure: this.props.exposure,
      composition: this.props.composition,
      faceQuality: this.props.faceQuality,
    };
  }

  /** A photo is only worth putting in front of a client above this bar. */
  get isAlbumWorthy(): boolean {
    return this.props.overall >= 55 && this.props.sharpness >= 40;
  }
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
