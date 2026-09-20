import { useEffect, useRef, type ReactNode } from "react";
import { useLanguage } from "../lib/i18n/LanguageContext";

export interface LightboxPhoto {
  id: string;
  fileName: string;
  previewUrl: string;
}

interface Props {
  photos: LightboxPhoto[];
  /** Index into `photos` of the photo being shown. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Extra controls between the arrows, e.g. the pick heart. Omitted for a plain slideshow. */
  controls?: ((photo: LightboxPhoto) => ReactNode) | undefined;
}

const SWIPE_DISTANCE = 45;

/**
 * A full-screen slideshow: previous/next buttons, left/right arrow keys, Escape
 * to close, and a horizontal swipe on touch screens. The neighbouring photos are
 * fetched ahead of time so stepping through is instant on a phone. It knows
 * nothing about picking or downloading — callers add controls if they want them.
 */
export function PhotoLightbox({ photos, index, onIndexChange, onClose, controls }: Props) {
  const { t } = useLanguage();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = photos.length;
  const photo = photos[index];

  const step = (delta: number) => {
    if (count === 0) return;
    onIndexChange((index + delta + count) % count);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Warm the cache for the photos either side of this one.
  useEffect(() => {
    for (const delta of [1, -1, 2]) {
      const neighbour = photos[(index + delta + count) % count];
      if (neighbour) new Image().src = neighbour.previewUrl;
    }
  }, [index, photos, count]);

  if (!photo) return null;

  return (
    <div className="modal-overlay pick-lightbox" role="presentation" onClick={onClose}>
      <div
        className="pick-lightbox__body"
        role="dialog"
        aria-modal="true"
        aria-label={photo.fileName}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const touch = event.changedTouches[0];
          touchStart.current = null;
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          // A mostly-horizontal drag is a swipe; a vertical one is the person scrolling or pinching.
          if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
        }}
      >
        <img src={photo.previewUrl} alt={photo.fileName} draggable={false} />
        <div className="pick-lightbox__controls">
          <button type="button" className="button" aria-label={t("pick.lightbox.prev")} onClick={() => step(-1)}>
            ‹
          </button>
          {controls?.(photo)}
          <span className="pick-lightbox__counter" aria-live="polite">
            {t("slideshow.counter", { index: index + 1, total: count })}
          </span>
          <button type="button" className="button" aria-label={t("pick.lightbox.next")} onClick={() => step(1)}>
            ›
          </button>
          <button type="button" className="button" onClick={onClose}>
            {t("pick.lightbox.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
