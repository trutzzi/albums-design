import { useEffect, useRef, useState, type FocusEvent } from "react";
import { useLocation } from "react-router-dom";

/**
 * Open/closed state for a small header dropdown. It closes on a route change and on a
 * press anywhere outside it; the listener exists only while it is open, so the closed
 * menus in the header cost nothing.
 */
export function useDisclosure<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /**
   * Tabbing out closes it too. Only when focus really lands elsewhere: Safari and macOS
   * Firefox do not focus a button on click, so a press on an item blurs to nothing
   * (`relatedTarget` null) before its click fires — closing then would swallow the click.
   * Presses outside are the pointer listener's job.
   */
  const onBlur = (event: FocusEvent<T>) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !ref.current?.contains(next)) setOpen(false);
  };

  return { open, setOpen, ref, onBlur };
}
