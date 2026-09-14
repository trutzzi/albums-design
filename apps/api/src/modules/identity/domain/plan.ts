export type PlanCode = "TRIAL" | "STARTER" | "STUDIO" | "STUDIO_PRO";

export interface Plan {
  code: PlanCode;
  name: string;
  monthlyPriceUsd: number;
  /** Albums that may be generated per billing period. Infinity for unlimited. */
  albumsPerPeriod: number;
  seats: number;
  watermarkDrafts: boolean;
  whiteLabelReview: boolean;
  priorityProcessing: boolean;
}

export const PLANS: Record<PlanCode, Plan> = {
  TRIAL: {
    code: "TRIAL",
    name: "Free trial",
    monthlyPriceUsd: 0,
    albumsPerPeriod: 1,
    seats: 1,
    watermarkDrafts: true,
    whiteLabelReview: false,
    priorityProcessing: false,
  },
  STARTER: {
    code: "STARTER",
    name: "Starter",
    monthlyPriceUsd: 39,
    albumsPerPeriod: 4,
    seats: 1,
    watermarkDrafts: true,
    whiteLabelReview: false,
    priorityProcessing: false,
  },
  STUDIO: {
    code: "STUDIO",
    name: "Studio",
    monthlyPriceUsd: 129,
    albumsPerPeriod: 15,
    seats: 3,
    watermarkDrafts: false,
    whiteLabelReview: false,
    priorityProcessing: true,
  },
  STUDIO_PRO: {
    code: "STUDIO_PRO",
    name: "Studio Pro",
    monthlyPriceUsd: 349,
    albumsPerPeriod: Number.POSITIVE_INFINITY,
    seats: Number.POSITIVE_INFINITY,
    watermarkDrafts: false,
    whiteLabelReview: true,
    priorityProcessing: true,
  },
};

export function planFor(code: PlanCode): Plan {
  return PLANS[code];
}
