/** How far a shoot's photo analysis has got, or null once nothing is left to analyse. */
export function analysisProgress(shoot: {
  photoCount: number;
  processingCount: number;
}): { done: number; total: number } | null {
  if (shoot.processingCount <= 0 || shoot.photoCount <= 0) return null;
  return { done: Math.max(0, shoot.photoCount - shoot.processingCount), total: shoot.photoCount };
}

/** How often the shoots list refreshes: while any shoot is still being analysed, every few seconds; otherwise never. */
export function shootsRefreshInterval(shoots: { processingCount: number }[] | undefined): number | false {
  return shoots?.some((shoot) => shoot.processingCount > 0) ? 5000 : false;
}
