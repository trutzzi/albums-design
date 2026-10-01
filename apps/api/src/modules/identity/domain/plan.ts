export type PlanCode = "TRIAL" | "STARTER" | "STUDIO" | "STUDIO_PRO";

export interface Plan {
  code: PlanCode;
  name: string;
  /** The list price, in euro per month. */
  regularPriceEur: number;
  /** What a studio that joined during the launch window pays, for as long as it stays. */
  launchPriceEur: number;
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
    regularPriceEur: 0,
    launchPriceEur: 0,
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
    regularPriceEur: 10,
    launchPriceEur: 5,
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
    regularPriceEur: 20,
    launchPriceEur: 10,
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
    regularPriceEur: 30,
    launchPriceEur: 13,
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

/**
 * The launch offer: a studio created before this moment pays each plan's launch price,
 * not just at first but for as long as it stays. Three months from the 2 October 2026
 * relaunch.
 */
export const LAUNCH_PRICES_UNTIL = new Date("2027-01-02T00:00:00Z");

/** Whether a studio joined in time to keep the launch prices. */
export function hasLaunchPrice(studioCreatedAt: Date): boolean {
  return studioCreatedAt < LAUNCH_PRICES_UNTIL;
}

/** What a studio pays per month on a plan: its launch price if it joined in time, the list price otherwise. */
export function monthlyPriceFor(plan: Plan, studioCreatedAt: Date): number {
  return hasLaunchPrice(studioCreatedAt) ? plan.launchPriceEur : plan.regularPriceEur;
}

/** What someone signing up right now would pay. */
export function currentPriceEur(plan: Plan, now: Date = new Date()): number {
  return monthlyPriceFor(plan, now);
}
