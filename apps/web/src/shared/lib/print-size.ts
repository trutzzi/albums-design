/** 250 → "25", 205 → "20.5": page sides are shown in centimetres, as labs sell them. */
export function cm(mm: number): string {
  return String(Math.round(mm) / 10);
}

/** "25×25". */
export function sizeLabel(size: { pageWidthMm: number; pageHeightMm: number }): string {
  return `${cm(size.pageWidthMm)}×${cm(size.pageHeightMm)}`;
}

/**
 * The size a finished PDF was made at, when it is not the album's size any more — so the
 * photographer does not send the lab a 25×25 file for a 30×30 order. Null when it matches,
 * or when the PDF predates sizes being recorded.
 */
export function madeAtOtherSize(
  job: { pageWidthMm: number | null; pageHeightMm: number | null },
  album: { pageWidthMm: number; pageHeightMm: number },
): string | null {
  if (job.pageWidthMm === null || job.pageHeightMm === null) return null;
  const same =
    Math.abs(job.pageWidthMm - album.pageWidthMm) < 0.5 && Math.abs(job.pageHeightMm - album.pageHeightMm) < 0.5;
  return same ? null : sizeLabel({ pageWidthMm: job.pageWidthMm, pageHeightMm: job.pageHeightMm });
}
