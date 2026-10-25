import { useEffect, type RefObject } from "react";

/**
 * Closes a menu or dialog on Escape, or on a press anywhere outside `ref`. Without `ref`
 * only Escape closes it: a modal's overlay handles the outside click itself, and closing
 * on the press would let the click land on the page behind.
 */
export function useDismiss(open: boolean, onClose: () => void, ref?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: PointerEvent) => {
      if (ref?.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    if (ref) document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onClose, ref]);
}
