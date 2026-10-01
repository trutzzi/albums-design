import { useEffect, useState, type RefObject } from "react";

/** Follows the scroll: whichever spread fills most of the window is the current one. */
export function useCurrentSpread(spreadCount: number) {
  const [currentSpread, setCurrentSpread] = useState(0);
  useEffect(() => {
    if (spreadCount === 0) return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(Number((entry.target as HTMLElement).dataset.spreadIndex), entry.intersectionRatio);
        }
        let best = -1;
        let bestRatio = 0;
        for (const [index, ratio] of ratios) {
          if (ratio > bestRatio) {
            best = index;
            bestRatio = ratio;
          }
        }
        if (best >= 0) setCurrentSpread(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    document.querySelectorAll<HTMLElement>("[data-spread-index]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [spreadCount]);
  return [currentSpread, setCurrentSpread] as const;
}

/**
 * The header is sticky and its height changes as its buttons wrap; what sits just under
 * it (the photo toolbar, a spread jumped to) reads how tall it is right now from
 * `--editor-header-h`. `mounted` re-attaches the observer once the header first renders.
 */
export function useHeaderHeightVariable(headerRef: RefObject<HTMLElement | null>, mounted: boolean) {
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--editor-header-h", `${header.offsetHeight}px`));
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--editor-header-h");
    };
  }, [headerRef, mounted]);
}
