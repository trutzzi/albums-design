import type { CSSProperties, ReactNode } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { lineWidths, tileRatios } from "@/shared/lib/skeleton";

/**
 * Loading states, in two kinds:
 *
 * - `LoadingState` — a spinner with a line of text, for waits whose result has no
 *   predictable shape (a whole studio page, an admin table).
 * - Skeletons — grey placeholders shaped like what is about to appear (a photo grid,
 *   shoot cards, a list of links), so the page does not jump when it arrives.
 *
 * Every one is announced once to screen readers through a hidden label; the shapes
 * themselves are hidden from them. Motion stops under `prefers-reduced-motion`.
 */

export function Spinner({ size = "medium" }: { size?: "small" | "medium" | "large" }) {
  return <span className={`spinner spinner--${size}`} aria-hidden="true" />;
}

/** A spinner and a label. `page` centres it in the page for a whole-screen wait. */
export function LoadingState({ label, page = false }: { label?: string | undefined; page?: boolean }) {
  const { t } = useLanguage();
  return (
    <div className={`loading-state ${page ? "loading-state--page" : ""}`} role="status" aria-live="polite">
      <Spinner size={page ? "large" : "medium"} />
      <span className="loading-state__label">{label ?? t("common.loading")}</span>
    </div>
  );
}

/** One placeholder block. Sizes are CSS lengths; `circle` makes it round. */
export function Skeleton({
  width = "100%",
  height = "1em",
  circle = false,
  style,
}: {
  width?: string;
  height?: string;
  circle?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`skeleton ${circle ? "skeleton--circle" : ""}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

/** The wrapper every composed skeleton shares: busy for assistive tech, with one spoken label. */
function SkeletonRegion({
  label,
  className,
  children,
}: {
  label?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className={className} role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label ?? t("common.loading")}</span>
      {children}
    </div>
  );
}

export function SkeletonText({ lines = 3, label }: { lines?: number; label?: string }) {
  return (
    <SkeletonRegion label={label} className="skeleton-text">
      {lineWidths(lines).map((width, index) => (
        <Skeleton key={index} width={width} height="0.9em" />
      ))}
    </SkeletonRegion>
  );
}

/** Rows shaped like `.album-list` items: a title and a detail line, a chip and a button on the right. */
export function SkeletonList({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <ul className="album-list" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index}>
            <div className="skeleton-stack">
              <Skeleton width="40%" height="1em" />
              <Skeleton width="65%" height="0.8em" />
            </div>
            <div className="panel__actions">
              <Skeleton width="56px" height="22px" style={{ borderRadius: 999 }} />
              <Skeleton width="72px" height="30px" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** Photo tiles in mixed proportions, laid out like the client gallery's columns. */
export function SkeletonPhotoGrid({
  count = 12,
  columnWidth = 220,
  label,
}: {
  count?: number;
  columnWidth?: number;
  label?: string | undefined;
}) {
  return (
    <SkeletonRegion label={label}>
      <PhotoTiles count={count} columnWidth={columnWidth} />
    </SkeletonRegion>
  );
}

/** Placeholder shoot cards, using the real card's frame so the grid does not shift when shoots arrive. */
export function SkeletonShootCards({ count = 6, label }: { count?: number; label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <div className="shoot-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="shoot-card shoot-card--skeleton">
            <span className="shoot-card__cover skeleton" />
            <div className="shoot-card__body">
              <Skeleton width="70%" height="1.1em" />
              <Skeleton width="45%" height="0.85em" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/**
 * The opening of a client page: the title block, then either a photo grid (pick,
 * download), one wide spread (album review) or one large cover (slideshow).
 */
export function ClientPageSkeleton({
  label,
  body = "grid",
}: {
  label?: string | undefined;
  body?: "grid" | "spread" | "cover";
}) {
  return (
    <SkeletonRegion label={label} className="page client-skeleton">
      <div className="client-skeleton__header" aria-hidden="true">
        <Skeleton width="140px" height="0.85em" />
        <Skeleton width="min(420px, 80%)" height="2rem" />
        <Skeleton width="180px" height="0.85em" />
      </div>
      <div aria-hidden="true">
        {body === "grid" && <PhotoTiles count={12} columnWidth={220} />}
        {body === "spread" && <span className="skeleton skeleton--tile client-skeleton__spread" />}
        {body === "cover" && <span className="skeleton skeleton--tile client-skeleton__cover" />}
      </div>
    </SkeletonRegion>
  );
}

function PhotoTiles({ count, columnWidth }: { count: number; columnWidth: number }) {
  return (
    <div
      className="skeleton-grid"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${columnWidth}px), 1fr))` }}
      aria-hidden="true"
    >
      {tileRatios(count).map((ratio, index) => (
        <span key={index} className="skeleton skeleton--tile" style={{ aspectRatio: String(ratio) }} />
      ))}
    </div>
  );
}
