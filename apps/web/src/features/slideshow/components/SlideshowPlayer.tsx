import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ClientGalleryPhoto, SlideshowSettings } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { useSlideNavigation } from "@/shared/ui/useSlideNavigation";
import { CONTROLS_HIDE_MS, playback, shouldAdvance, type PlaybackAction, type PlaybackState } from "../lib/autoplay";
import { useWakeLock } from "../hooks/useWakeLock";

interface Props {
  photos: ClientGalleryPhoto[];
  settings: SlideshowSettings;
  /** A photo's preview failed to load — most likely its URL expired — so the page may fetch fresh ones. */
  onImageError: (photoId: string) => void;
  onExit: () => void;
}

/**
 * The full-screen player. Two stacked layers make the crossfade: the photo that was
 * showing stays underneath while the new one fades in over it. Controls fade away
 * after a few seconds and come back on any touch, click or key.
 */
export function SlideshowPlayer({ photos, settings, onImageError, onExit }: Props) {
  const { t } = useLanguage();
  const count = photos.length;
  const [state, dispatch] = useReducer(
    (current: PlaybackState, action: PlaybackAction) => playback(current, action, count),
    { index: 0, playing: true },
  );
  const [previous, setPrevious] = useState<number | null>(null);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  const [controlsShown, setControlsShown] = useState(true);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const hideTimer = useRef<number | undefined>(undefined);
  const controls = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (action: PlaybackAction) => {
      setPrevious(state.index);
      dispatch(action);
    },
    [state.index],
  );

  // The clock: one timeout per photo, so a manual step restarts the full interval.
  useEffect(() => {
    if (!shouldAdvance(state, { hidden, count })) return;
    const timer = window.setTimeout(() => go({ type: "tick" }), settings.intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [state, hidden, count, settings.intervalSeconds, go]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  // Keep a TV or laptop from going to sleep halfway through.
  useWakeLock(state.playing && !hidden);

  const wake = useCallback(() => {
    setControlsShown(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      // Never hide a control the keyboard is on: an invisible focused button is a dead end.
      if (controls.current?.contains(document.activeElement)) return;
      setControlsShown(false);
    }, CONTROLS_HIDE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => window.clearTimeout(hideTimer.current);
  }, [wake]);

  // iPhone Safari cannot put an element full screen; there the player already fills the window.
  const canFullscreen = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
  const toggleFullscreen = useCallback(() => {
    if (!canFullscreen) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    // The whole page, as the start screen asks for: the player already fills it.
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, [canFullscreen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      wake();
      // Space on a focused control presses that control, as everywhere else on the web.
      if (event.key === " " && isControl(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        dispatch({ type: "toggle" });
      } else if (event.key === "ArrowRight") go({ type: "next" });
      else if (event.key === "ArrowLeft") go({ type: "previous" });
      else if (event.key === "f" || event.key === "F") toggleFullscreen();
      // Escape leaves full screen on its own; only outside it does it close the player.
      else if (event.key === "Escape" && !document.fullscreenElement) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, wake, toggleFullscreen, onExit]);

  const urls = useMemo(() => photos.map((photo) => photo.previewUrl), [photos]);
  const swipe = useSlideNavigation({
    urls,
    index: state.index,
    onStep: (delta) => go({ type: delta === 1 ? "next" : "previous" }),
  });

  const current = photos[state.index];
  const under = previous !== null && previous !== state.index ? photos[previous] : undefined;
  if (!current) return null;
  const fade = settings.transition === "FADE";

  return (
    <div
      className={`slideshow ${controlsShown ? "" : "slideshow--idle"}`}
      role="region"
      aria-roledescription={t("slideshow.player.label")}
      aria-label={t("slideshow.counter", { index: state.index + 1, total: count })}
      onMouseMove={wake}
      onClick={wake}
      {...swipe}
    >
      {fade && under && <img className="slideshow__photo" src={under.previewUrl} alt="" aria-hidden="true" />}
      <img
        // A new key restarts the fade-in for every photo.
        key={current.id}
        className={`slideshow__photo ${fade ? "slideshow__photo--fade" : ""}`}
        src={current.previewUrl}
        alt={current.fileName}
        draggable={false}
        onError={() => onImageError(current.id)}
      />

      <div ref={controls} className="slideshow__controls" onFocus={wake}>
        <button
          type="button"
          className="slideshow__button"
          aria-label={t("pick.lightbox.prev")}
          onClick={() => go({ type: "previous" })}
        >
          ‹
        </button>
        <button
          type="button"
          className="slideshow__button slideshow__button--play"
          aria-label={state.playing ? t("slideshow.player.pause") : t("slideshow.player.play")}
          onClick={() => dispatch({ type: "toggle" })}
        >
          {state.playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          className="slideshow__button"
          aria-label={t("pick.lightbox.next")}
          onClick={() => go({ type: "next" })}
        >
          ›
        </button>
        <span className="slideshow__counter" aria-live="polite">
          {t("slideshow.counter", { index: state.index + 1, total: count })}
        </span>
        {canFullscreen && (
          <button type="button" className="slideshow__button" onClick={toggleFullscreen}>
            {fullscreen ? t("slideshow.player.exitFullscreen") : t("slideshow.player.fullscreen")}
          </button>
        )}
        <button type="button" className="slideshow__button" onClick={onExit}>
          {t("pick.lightbox.close")}
        </button>
      </div>
    </div>
  );
}

function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button, a, input, select, textarea"));
}
