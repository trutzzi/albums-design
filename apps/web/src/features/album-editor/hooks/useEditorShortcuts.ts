import { useEffect, useRef } from "react";

interface ShortcutState {
  currentSpread: number;
  spreadCount: number;
  spreads: readonly { locked?: boolean | undefined }[];
  selected: { spreadIndex: number; slotId: string } | null;
  /** An approved album: nothing that edits it runs. */
  locked: boolean;
  /** A dialog has the keyboard. */
  modalOpen: boolean;
}

interface ShortcutActions {
  undo: () => void;
  redo: () => void;
  showShortcuts: () => void;
  showPreview: () => void;
  showCheck: () => void;
  /** Escape: drop whatever is selected or armed. */
  clearSelection: () => void;
  jumpToSpread: (spreadIndex: number) => void;
  cycleDesign: (spreadIndex: number, step: 1 | -1) => void;
  shuffle: (spreadIndex: number) => void;
  mirror: (spreadIndex: number) => void;
  toggleLock: (spreadIndex: number, locked: boolean) => void;
  removeSelectedPhoto: () => void;
}

/**
 * The editor's keyboard shortcuts (listed in ShortcutsHelp). The listener is installed
 * once and reads the latest state and actions through a ref.
 */
export function useEditorShortcuts(state: ShortcutState, actions: ShortcutActions) {
  const latest = useRef({ state, actions });
  latest.current = { state, actions };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { state, actions } = latest.current;
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing || state.modalOpen) return;
      const mod = event.metaKey || event.ctrlKey;
      const here = state.currentSpread;

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (state.locked) return;
        if (event.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        if (!state.locked) actions.redo();
        return;
      }
      if (mod || event.altKey) return;

      switch (event.key) {
        case "?":
          actions.showShortcuts();
          return;
        case "Escape":
          actions.clearSelection();
          return;
        case "p":
        case "P":
          actions.showPreview();
          return;
        case "c":
        case "C":
          actions.showCheck();
          return;
      }
      // Arrow keys belong to the selected photo (they nudge it). Without one, up and down
      // turn pages and left and right step through the current spread's designs.
      if (!state.selected && (event.key === "ArrowDown" || event.key === "PageDown")) {
        event.preventDefault();
        actions.jumpToSpread(Math.min(state.spreadCount - 1, here + 1));
        return;
      }
      if (!state.selected && (event.key === "ArrowUp" || event.key === "PageUp")) {
        event.preventDefault();
        actions.jumpToSpread(Math.max(0, here - 1));
        return;
      }
      if (state.locked) return;
      const spread = state.spreads[here];
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowRight":
          if (!state.selected && spread && !spread.locked) {
            event.preventDefault();
            actions.cycleDesign(here, event.key === "ArrowRight" ? 1 : -1);
          }
          return;
        case "s":
        case "S":
          if (spread && !spread.locked) actions.shuffle(here);
          return;
        case "m":
        case "M":
          if (spread && !spread.locked) actions.mirror(here);
          return;
        case "l":
        case "L":
          if (spread) actions.toggleLock(here, !spread.locked);
          return;
        case "Delete":
        case "Backspace":
          if (state.selected && !state.spreads[state.selected.spreadIndex]?.locked) {
            event.preventDefault();
            actions.removeSelectedPhoto();
          }
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
