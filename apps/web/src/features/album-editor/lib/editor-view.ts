/** "scroll": every spread stacked, as the editor has always been. "focus": one spread at a time. */
export type EditorView = "scroll" | "focus";

const KEY = "albumflow.editorView";

/** Storage can hold anything; only a known view counts, otherwise the familiar scroll view. */
export function parseEditorView(raw: string | null): EditorView {
  return raw === "focus" ? "focus" : "scroll";
}

/** Remembered per browser. Storage can throw (private mode), so it is guarded. */
export function loadEditorView(): EditorView {
  try {
    return parseEditorView(window.localStorage.getItem(KEY));
  } catch {
    return "scroll";
  }
}

export function saveEditorView(view: EditorView): void {
  try {
    window.localStorage.setItem(KEY, view);
  } catch {
    // Not remembered — the choice still applies for this visit.
  }
}

/** The spread before and after `index`, or null at either end: the focus view's ‹ › buttons. */
export function neighboursOf(index: number, count: number): { previous: number | null; next: number | null } {
  return { previous: index > 0 ? index - 1 : null, next: index < count - 1 ? index + 1 : null };
}
