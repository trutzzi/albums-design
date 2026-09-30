import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../lib/i18n/LanguageContext";

export interface TourStep {
  /** CSS selector of the element to light up — a `[data-tour="…"]` attribute by convention. */
  target: string;
  /** Translation keys. */
  titleKey: string;
  bodyKey: string;
}

// --- which tour the current page offers ----------------------------------------
// The header's "Guide" link replays whatever tour the page on screen registered; a
// page without one shows no link. A tiny store rather than a context, so the header
// and the page need no shared provider around them.
let current: { id: string; start: () => void } | null = null;
const listeners = new Set<() => void>();
function setCurrent(next: typeof current) {
  current = next;
  for (const listener of listeners) listener();
}
export function useAvailableTour() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

const seenKey = (id: string) => `albumflow.tour.${id}.seen`;
function hasSeen(id: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return true; // No storage (private mode): never ambush the user with an auto-start.
  }
}
function markSeen(id: string) {
  try {
    window.localStorage.setItem(seenKey(id), "1");
  } catch {
    // Storage unavailable: the tour simply offers itself again next time.
  }
}

const PAD = 8;
const CARD_WIDTH = 340;

/**
 * A step-by-step walk through one page: the page dims, one element at a time is lit up,
 * and a card beside it says what it is for. Starts by itself the first time the page is
 * opened (once `ready`), and again whenever the header's Guide link is used. Steps whose
 * element is not on the page right now (no shoots yet, say) are skipped, not shown empty.
 */
export function GuidedTour({ id, steps, ready = true }: { id: string; steps: TourStep[]; ready?: boolean }) {
  const { t } = useLanguage();
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // On the page and actually drawn: a link folded into the phone menu has no box.
  const available = useCallback(
    () => steps.filter((step) => (document.querySelector(step.target)?.getClientRects().length ?? 0) > 0),
    [steps],
  );
  const [active, setActive] = useState<TourStep[]>([]);

  const start = useCallback(() => {
    const present = available();
    if (present.length === 0) return;
    setActive(present);
    setIndex(0);
  }, [available]);

  const finish = useCallback(() => {
    markSeen(id);
    setIndex(null);
    setRect(null);
  }, [id]);

  useEffect(() => {
    setCurrent({ id, start });
    return () => setCurrent(null);
  }, [id, start]);

  // First visit: wait for the page's content, then let it settle before starting.
  useEffect(() => {
    if (!ready || hasSeen(id)) return;
    const timer = setTimeout(start, 700);
    return () => clearTimeout(timer);
  }, [ready, id, start]);

  const step = index !== null ? active[index] : undefined;

  useLayoutEffect(() => {
    if (!step) return;
    document.querySelector(step.target)?.scrollIntoView({ block: "center", behavior: "smooth" });
    // Looked up afresh every time, never held: React may replace the node, and content
    // loading above it moves it without any scroll or resize event to hear about.
    const measure = () => {
      const element = document.querySelector(step.target);
      const next = element && element.getClientRects().length > 0 ? element.getBoundingClientRect() : null;
      setRect((previous) =>
        previous && next &&
        previous.top === next.top && previous.left === next.left &&
        previous.width === next.width && previous.height === next.height
          ? previous
          : next,
      );
    };
    measure();
    const timer = setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    if (index === null) return;
    cardRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      else if (event.key === "ArrowRight") setIndex((value) => (value !== null && value < active.length - 1 ? value + 1 : value));
      else if (event.key === "ArrowLeft") setIndex((value) => (value !== null && value > 0 ? value - 1 : value));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, active.length, finish]);

  if (index === null || !step) return null;

  const last = index === active.length - 1;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardWidth = Math.min(CARD_WIDTH, viewportWidth - 24);
  // Below the element when there is room, above it otherwise; kept inside the screen.
  let cardStyle: React.CSSProperties = { width: cardWidth, left: 12, top: 12 };
  if (rect) {
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardWidth / 2), viewportWidth - cardWidth - 12);
    const below = rect.bottom + PAD + 12;
    const fitsBelow = below + 220 < viewportHeight;
    cardStyle = fitsBelow
      ? { width: cardWidth, left, top: Math.min(below, viewportHeight - 220) }
      : { width: cardWidth, left, bottom: Math.max(12, viewportHeight - rect.top + PAD + 12) };
  }

  return createPortal(
    <div className="tour" role="presentation">
      {rect ? (
        <div
          className="tour__spotlight"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="tour__dim" />
      )}
      <div
        ref={cardRef}
        className="tour__card"
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
      >
        <p className="tour__progress">{t("tour.progress", { step: index + 1, total: active.length })}</p>
        <h2 id="tour-title">{t(step.titleKey)}</h2>
        <p id="tour-body">{t(step.bodyKey)}</p>
        <div className="tour__dots" aria-hidden="true">
          {active.map((item, dot) => (
            <span key={item.target} className={dot === index ? "is-on" : ""} />
          ))}
        </div>
        <div className="tour__actions">
          <button type="button" className="link-button" onClick={finish}>
            {t("tour.skip")}
          </button>
          <span className="tour__spacer" />
          {index > 0 && (
            <button type="button" className="button button--small" onClick={() => setIndex(index - 1)}>
              {t("tour.back")}
            </button>
          )}
          <button
            type="button"
            className="button button--small button--primary"
            onClick={() => (last ? finish() : setIndex(index + 1))}
          >
            {last ? t("tour.done") : t("tour.next")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
