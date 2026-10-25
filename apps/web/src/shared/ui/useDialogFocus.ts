import { useEffect, type RefObject } from "react";
import { FOCUSABLE } from "@/shared/lib/roving-focus";

/**
 * Keeps keyboard focus inside an open modal dialog: moves it in on open (to `initial`, or
 * the first control), wraps Tab round at both ends, stops the page behind from scrolling,
 * and hands focus back to whatever opened the dialog when it closes.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, initial?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (initial?.current ?? focusable()[0] ?? dialog).focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const inside = dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      // The opener can be gone (a menu that closed with the choice); then focus stays put.
      if (opener?.isConnected) opener.focus();
    };
  }, [ref, initial]);
}
