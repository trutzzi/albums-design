import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useLanguage } from "../lib/i18n/LanguageContext";

// --- open from anywhere --------------------------------------------------------
// The header's "How it works" link and the shoots page's first-visit welcome both open
// the same overview, rendered once by <HowItWorksHost/>. A tiny store, like the guided
// tours', so neither needs a provider around it.
let isOpen = false;
const listeners = new Set<() => void>();
function setOpen(next: boolean) {
  isOpen = next;
  for (const listener of listeners) listener();
}

export function openHowItWorks(): void {
  setOpen(true);
}

/** True while the overview is on screen — the shoots page holds its guided tour until it closes. */
export function useHowItWorksOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => isOpen,
  );
}

const SEEN_KEY = "albumflow.howItWorks.seen";

/** Whether this browser has been shown the overview. Without storage, assume yes: never ambush. */
export function howItWorksSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage unavailable: the welcome simply is not repeated in this session anyway.
  }
}

// --- the overview ----------------------------------------------------------------

const STEPS: { key: string; optional?: boolean; icon: ReactNode }[] = [
  {
    key: "shoot",
    icon: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7l1.5-3h5L16 7" />
        <circle cx="12" cy="13.5" r="3.5" />
      </>
    ),
  },
  {
    key: "upload",
    icon: (
      <>
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </>
    ),
  },
  {
    key: "picks",
    optional: true,
    icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  },
  {
    key: "album",
    icon: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="1.5" />
        <path d="M12 5v14" />
        <rect x="5" y="8" width="5" height="8" />
        <rect x="14" y="8" width="5" height="3.5" />
        <rect x="14" y="12.5" width="5" height="3.5" />
      </>
    ),
  },
  {
    key: "proof",
    icon: (
      <>
        <path d="M4 5h16v11H9l-5 4z" />
        <path d="M8.5 10.5l2.5 2.5 4.5-5" />
      </>
    ),
  },
  {
    key: "deliver",
    icon: (
      <>
        <path d="M7 9V3h10v6" />
        <rect x="3" y="9" width="18" height="8" rx="1.5" />
        <path d="M7 14h10v7H7z" />
      </>
    ),
  },
];

/**
 * The whole journey on one screen — create a shoot, upload, (client picks), build the
 * album, proof, print and deliver — so a new photographer knows where everything is
 * heading before the first click. The pages' own guided tours then explain the details.
 */
function HowItWorksModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal how-it-works"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="how-it-works-title">{t("howItWorks.title")}</h2>
        <p className="muted">{t("howItWorks.subtitle")}</p>
        <ol className="how-it-works__steps">
          {STEPS.map((step, index) => (
            <li key={step.key} className="how-it-works__step">
              <div className="how-it-works__head">
                <span className="how-it-works__number" aria-hidden="true">
                  {index + 1}
                </span>
                <svg
                  className="how-it-works__icon"
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {step.icon}
                </svg>
                {step.optional && <span className="chip">{t("howItWorks.optional")}</span>}
              </div>
              <h3>{t(`howItWorks.${step.key}.title`)}</h3>
              <p>{t(`howItWorks.${step.key}.body`)}</p>
            </li>
          ))}
        </ol>
        <p className="muted how-it-works__footnote">{t("howItWorks.footnote")}</p>
        <div className="modal__actions">
          <button ref={closeRef} type="button" className="button button--primary" onClick={onClose}>
            {t("howItWorks.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function close(): void {
  markSeen();
  setOpen(false);
}

/** Rendered once, in the header, so the overview can open over any page. */
export function HowItWorksHost() {
  const open = useHowItWorksOpen();
  return open ? <HowItWorksModal onClose={close} /> : null;
}
