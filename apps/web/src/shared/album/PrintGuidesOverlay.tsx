import { memo } from "react";

export interface PrintGuidesOverlayProps {
  /** Real-world width/height of a single page, in millimetres. */
  pageWidthMm: number;
  pageHeightMm: number;
  /** Safe area inset from the trim edge where nothing important should sit. */
  safeMarginMm: number;
}

/**
 * Two guides a print lab actually cuts and binds against: the trim line —
 * where the spread's own edge in this editor already IS the final cut edge,
 * so it only needs highlighting, not repositioning — and the safe area,
 * inset from trim by the selected print profile's margin. The safe area is
 * drawn per page, not once across the whole spread, because each page also
 * needs its own margin on the gutter side: the fold eats into that edge the
 * same way trimming eats into the outer ones.
 */
export const PrintGuidesOverlay = memo(function PrintGuidesOverlay({
  pageWidthMm,
  pageHeightMm,
  safeMarginMm,
}: PrintGuidesOverlayProps) {
  const spreadWidthMm = pageWidthMm * 2;
  // A hairline inset so the trim rectangle's stroke doesn't get clipped in
  // half by the viewBox boundary it would otherwise sit exactly on.
  const edge = Math.min(0.5, pageWidthMm * 0.002);

  return (
    <svg
      className="print-guides-overlay"
      viewBox={`0 0 ${spreadWidthMm} ${pageHeightMm}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect
        x={edge}
        y={edge}
        width={spreadWidthMm - edge * 2}
        height={pageHeightMm - edge * 2}
        className="trim-guide-line"
        vectorEffect="non-scaling-stroke"
      />
      {safeMarginMm > 0 && (
        <>
          <rect
            x={safeMarginMm}
            y={safeMarginMm}
            width={Math.max(0, pageWidthMm - safeMarginMm * 2)}
            height={Math.max(0, pageHeightMm - safeMarginMm * 2)}
            className="safe-area-guide-line"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x={pageWidthMm + safeMarginMm}
            y={safeMarginMm}
            width={Math.max(0, pageWidthMm - safeMarginMm * 2)}
            height={Math.max(0, pageHeightMm - safeMarginMm * 2)}
            className="safe-area-guide-line"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
});
