/**
 * What each client chose, kept apart. A shoot can have several selection links (the couple,
 * a parent, the best man), and merging them all into one set hid whose picks were whose.
 */
export const ALL_CLIENTS = "all";

export interface ClientSelection {
  sessionId: string;
  /** The name the photographer gave the link; empty when none was given. */
  clientName: string;
  photoIds: string[];
}

interface SubmittedLike {
  id: string;
  clientName: string;
  status: string;
  submittedAt: string | null;
  pickedPhotoIds: string[];
}

/** Every sent selection, oldest first, which is the order the photographer received them. */
export function submittedSelections(sessions: readonly SubmittedLike[] | undefined): ClientSelection[] {
  return (sessions ?? [])
    .filter((session) => session.status === "SUBMITTED")
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))
    .map((session) => ({
      sessionId: session.id,
      clientName: session.clientName.trim(),
      photoIds: session.pickedPhotoIds,
    }));
}

/**
 * The photos to mark as picked: one client's selection, or everyone's together. A choice that
 * no longer exists (the link was revoked) falls back to everyone's.
 */
export function picksOf(selections: readonly ClientSelection[], chosen: string): Set<string> {
  const one = selections.find((selection) => selection.sessionId === chosen);
  return new Set(one ? one.photoIds : selections.flatMap((selection) => selection.photoIds));
}
