import type { LayoutSuggestionDTO } from "@albumflow/contracts";

/** How far below the best fit an alternative may score and still be chosen for variety. */
const VARIETY_TOLERANCE = 0.15;

/**
 * The layout for a new or changed spread. The ranking depends only on the photos, so the
 * same mix of photos always ranks the same layout first: every new spread came out
 * identical to the one before it, and had to be changed by hand. The best-ranked layout
 * that the neighbouring spreads do not already use is taken instead, as long as it fits
 * nearly as well as the best. Otherwise the best is kept: variety never beats a good fit.
 */
export function chooseLayout(
  ranked: readonly LayoutSuggestionDTO[],
  neighbourTemplateIds: readonly (string | undefined)[],
): LayoutSuggestionDTO | undefined {
  const best = ranked[0];
  if (!best) return undefined;
  const avoid = new Set(neighbourTemplateIds.filter((id): id is string => Boolean(id)));
  if (!avoid.has(best.templateId)) return best;
  const floor = best.fitScore - Math.abs(best.fitScore) * VARIETY_TOLERANCE;
  return ranked.find((entry) => !avoid.has(entry.templateId) && entry.fitScore >= floor) ?? best;
}
