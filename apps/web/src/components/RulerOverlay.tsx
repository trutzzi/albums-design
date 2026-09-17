import { memo, type ReactNode } from "react";

export interface RulerOverlayProps {
  /** Real-world width/height of the whole spread, in millimetres. */
  widthMm: number;
  heightMm: number;
}

const MINOR_STEP_MM = 10; // one tick per centimetre
const MAJOR_EVERY = 5; // a labelled, heavier line every 5cm

/**
 * A centimetre grid drawn as SVG so it scales cleanly with the spread at any
 * screen size, rather than needing separate pixel math per tick. Rendered as
 * an early sibling before the slots in SpreadCanvas, so it paints strictly
 * beneath every photo — visible only in the margins and gutters, which is
 * exactly where alignment actually needs checking against a straight edge.
 */
export const RulerOverlay = memo(function RulerOverlay({ widthMm, heightMm }: RulerOverlayProps) {
  const widthCm = widthMm / MINOR_STEP_MM;
  const heightCm = heightMm / MINOR_STEP_MM;

  const verticals: ReactNode[] = [];
  for (let cm = 0; cm <= widthCm; cm += 1) {
    const major = cm % MAJOR_EVERY === 0;
    verticals.push(
      <line
        key={`v${cm}`}
        x1={cm}
        y1={0}
        x2={cm}
        y2={heightCm}
        vectorEffect="non-scaling-stroke"
        className={major ? "ruler-line ruler-line--major" : "ruler-line"}
      />,
    );
    if (major) {
      verticals.push(
        <text key={`vt${cm}`} x={cm + 0.15} y={1.1} className="ruler-label">
          {cm}
        </text>,
      );
    }
  }

  const horizontals: ReactNode[] = [];
  for (let cm = 0; cm <= heightCm; cm += 1) {
    const major = cm % MAJOR_EVERY === 0;
    horizontals.push(
      <line
        key={`h${cm}`}
        x1={0}
        y1={cm}
        x2={widthCm}
        y2={cm}
        vectorEffect="non-scaling-stroke"
        className={major ? "ruler-line ruler-line--major" : "ruler-line"}
      />,
    );
    if (major && cm > 0) {
      horizontals.push(
        <text key={`ht${cm}`} x={0.15} y={cm - 0.3} className="ruler-label">
          {cm}
        </text>,
      );
    }
  }

  return (
    <svg
      className="ruler-overlay"
      viewBox={`0 0 ${widthCm} ${heightCm}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {verticals}
      {horizontals}
    </svg>
  );
});
