import type { PlanDto } from "@/shared/api";

/** A translation key and its values, for the caller to render in the current language. */
export interface Highlight {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * What a plan includes, in the order a photographer weighs it: albums, photos per shoot,
 * seats, what clients receive, and whether proofs carry a watermark. Singular counts get
 * their own wording, so the trial never reads "1 albums".
 */
export function planHighlights(plan: PlanDto): Highlight[] {
  const lines: Highlight[] = [];
  lines.push(
    plan.albumsPerPeriod === null
      ? { key: "studio.plan.albumsUnlimited" }
      : plan.albumsPerPeriod === 1
        ? { key: "landing.pricing.oneAlbum" }
        : { key: "studio.plan.albums", params: { count: plan.albumsPerPeriod } },
  );
  lines.push(
    plan.maxPhotosPerShoot === null
      ? { key: "studio.plan.photosUnlimited" }
      : { key: "studio.plan.photos", params: { count: plan.maxPhotosPerShoot } },
  );
  lines.push(
    plan.seats === null
      ? { key: "studio.plan.seatsUnlimited" }
      : plan.seats === 1
        ? { key: "landing.pricing.oneSeat" }
        : { key: "studio.plan.seats", params: { count: plan.seats } },
  );
  if (plan.clientDownloadLinks) lines.push({ key: "studio.plan.downloadLinks" });
  if (plan.clientSlideshows) lines.push({ key: "landing.pricing.slideshows" });
  lines.push({ key: plan.watermarkDrafts ? "studio.plan.watermarked" : "studio.plan.noWatermark" });
  if (plan.watermarkExports) lines.push({ key: "studio.plan.watermarkedExports" });
  return lines;
}

/** The plan most studios should start a paid month on. */
export function isRecommended(plan: PlanDto): boolean {
  return plan.code === "STUDIO";
}

/** The list price is shown struck through only while the launch price is lower. */
export function hasLaunchDiscount(plan: PlanDto): boolean {
  return plan.monthlyPriceEur < plan.regularPriceEur;
}

/** The free trial, by its code — not by a price of zero, which a promotion could also reach. */
export function isTrial(plan: PlanDto): boolean {
  return plan.code === "TRIAL";
}
