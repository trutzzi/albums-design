import { useEffect, useMemo, type ReactNode } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { useSlideNavigation } from "./useSlideNavigation";

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

/**
 * A full-screen slideshow: previous/next buttons, left/right arrow keys, Escape
 * to close, and a horizontal swipe on touch screens. The neighbouring photos are
 * fetched ahead of time so stepping through is instant on a phone. It knows
 * nothing about picking or downloading — callers add controls if they want them.
 */
export function PhotoLightbox({ photos, index, onIndexChange, onClose, controls }: Props) {
  const { t } = useLanguage();
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

  const urls = useMemo(() => photos.map((item) => item.previewUrl), [photos]);
  const swipe = useSlideNavigation({ urls, index, onStep: step });

  if (!photo) return null;

  return (
    <div className="modal-overlay pick-lightbox" role="presentation" onClick={onClose}>
      <div
        className="pick-lightbox__body"
        role="dialog"
        aria-modal="true"
        aria-label={photo.fileName}
        onClick={(event) => event.stopPropagation()}
        {...swipe}
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
