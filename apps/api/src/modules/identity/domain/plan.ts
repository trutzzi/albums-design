export type PlanCode = "TRIAL" | "STARTER" | "STUDIO" | "STUDIO_PRO";

export interface Plan {
  code: PlanCode;
  name: string;
  monthlyPriceEur: number;
  /** Albums that may be generated per billing period. Infinity for unlimited. */
  albumsPerPeriod: number;
  seats: number;
  /** Photos one shoot may hold. Infinity for unlimited. */
  maxPhotosPerShoot: number;
  /** May send clients a link to download the full-resolution photos. */
  clientDownloadLinks: boolean;
  /** Client review pages show a watermark: proofs are for choosing, not for keeping. */
  watermarkDrafts: boolean;
  /** Exported PDFs carry one too — only the free trial, so it cannot stand in for a paid plan. */
  watermarkExports: boolean;
  whiteLabelReview: boolean;
  priorityProcessing: boolean;
}

export const PLANS: Record<PlanCode, Plan> = {
  TRIAL: {
    code: "TRIAL",
    name: "Free trial",
    monthlyPriceEur: 0,
    albumsPerPeriod: 1,
    seats: 1,
    maxPhotosPerShoot: 80,
    clientDownloadLinks: false,
    watermarkDrafts: true,
    watermarkExports: true,
    whiteLabelReview: false,
    priorityProcessing: false,
  },
  STARTER: {
    code: "STARTER",
    name: "Starter",
    monthlyPriceEur: 3,
    albumsPerPeriod: 4,
    seats: 1,
    maxPhotosPerShoot: 80,
    clientDownloadLinks: false,
    watermarkDrafts: true,
    watermarkExports: false,
    whiteLabelReview: false,
    priorityProcessing: false,
  },
  STUDIO: {
    code: "STUDIO",
    name: "Studio",
    monthlyPriceEur: 5,
    albumsPerPeriod: 15,
    seats: 3,
    maxPhotosPerShoot: Number.POSITIVE_INFINITY,
    clientDownloadLinks: true,
    watermarkDrafts: false,
    watermarkExports: false,
    whiteLabelReview: false,
    priorityProcessing: true,
  },
  STUDIO_PRO: {
    code: "STUDIO_PRO",
    name: "Studio Pro",
    monthlyPriceEur: 10,
    albumsPerPeriod: Number.POSITIVE_INFINITY,
    seats: Number.POSITIVE_INFINITY,
    maxPhotosPerShoot: Number.POSITIVE_INFINITY,
    clientDownloadLinks: true,
    watermarkDrafts: false,
    watermarkExports: false,
    whiteLabelReview: true,
    priorityProcessing: true,
  },
};

/** Where every new studio starts; only a platform admin moves it after that. */
export const DEFAULT_PLAN: PlanCode = "STUDIO";

export function planFor(code: PlanCode): Plan {
  return PLANS[code];
}
