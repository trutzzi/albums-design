import { useEffect, useRef, type TouchEvent } from "react";

const SWIPE_DISTANCE = 45;

/**
 * What every full-screen photo viewer shares: a horizontal swipe steps through photos,
 * and the neighbouring photos are fetched ahead of time so stepping is instant on a phone.
 * Returns the touch handlers to spread on the element that receives the swipe.
 */
export function useSlideNavigation(params: {
  urls: readonly string[];
  index: number;
  onStep: (delta: 1 | -1) => void;
}) {
  const { urls, index, onStep } = params;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = urls.length;

  // Warm the cache for the photos either side of this one.
  useEffect(() => {
    if (count === 0) return;
    for (const delta of [1, -1, 2]) {
      const url = urls[(index + delta + count) % count];
      if (url) new Image().src = url;
    }
  }, [index, urls, count]);

  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0];
      touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const start = touchStart.current;
      const touch = event.changedTouches[0];
      touchStart.current = null;
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      // A mostly-horizontal drag is a swipe; a vertical one is the person scrolling or pinching.
      if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) onStep(dx < 0 ? 1 : -1);
    },
  };
}
