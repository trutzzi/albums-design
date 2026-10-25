import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { useDismiss } from "@/shared/ui/useDismiss";
import { nextFocusIndex } from "@/shared/lib/roving-focus";

/**
 * A button that opens a short list of choices. On a wide screen it drops down under the
 * button; on a phone, when `sheetTitle` is given, the same list rises from the bottom as a
 * sheet over a dimmed page — easier to reach with a thumb. Arrow keys move through the
 * choices; a choice or Escape hands focus back to the button.
 */
export function GalleryMenu({
  label,
  buttonClassName,
  buttonContent,
  disabled,
  align = "start",
  sheetTitle,
  note,
  children,
}: {
  label: string;
  buttonClassName: string;
  /** What the button shows; the label alone when omitted. */
  buttonContent?: ReactNode;
  disabled?: boolean | undefined;
  align?: "start" | "end";
  /** Turns the list into a bottom sheet with this title on a phone. */
  sheetTitle?: string | undefined;
  /** A line under the choices, e.g. how the download arrives. */
  note?: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  // A choice or Escape hands focus back to the button; a press elsewhere leaves it where it went.
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  useDismiss(open, dismiss, ref);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onListKey = (event: KeyboardEvent) => {
    // Tab too: focus goes back to the button first, so it then moves on from there.
    if (event.key === "Escape" || event.key === "Tab") return close();
    const list = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const next = nextFocusIndex(event.key, list.indexOf(document.activeElement as HTMLElement), list.length);
    if (next === null) return;
    event.preventDefault();
    list[next]?.focus();
  };

  return (
    <div className={`gallery-menu ${sheetTitle ? "gallery-menu--sheet" : ""}`} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {buttonContent ?? label}
        <svg className="gallery-menu__chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <>
          {/* Only drawn on a phone, behind the sheet; a press on it closes the menu. */}
          {sheetTitle && <div className="gallery-menu__backdrop" aria-hidden="true" onClick={close} />}
          <div className={`gallery-menu__panel gallery-menu__panel--${align}`}>
            {sheetTitle && (
              <div className="gallery-menu__sheet-head">
                <span className="gallery-menu__grabber" aria-hidden="true" />
                <span className="gallery-menu__sheet-title" aria-hidden="true">
                  {sheetTitle}
                </span>
                <button
                  type="button"
                  className="gallery-menu__close"
                  aria-label={t("gallery.menu.close")}
                  onClick={close}
                >
                  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
                    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
            <div ref={listRef} className="gallery-menu__list" role="menu" aria-label={label} onKeyDown={onListKey}>
              {children(close)}
            </div>
            {note && <p className="gallery-menu__note">{note}</p>}
          </div>
        </>
      )}
    </div>
  );
}
