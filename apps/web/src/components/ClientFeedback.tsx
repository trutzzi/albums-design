import { memo } from "react";
import type { AlbumFeedback, FeedbackComment } from "../lib/api";

export interface ClientFeedbackProps {
  feedback: AlbumFeedback | undefined;
  loading: boolean;
  /** Set when the feedback could not be loaded at all. */
  error: Error | null;
  resolvingId: string | null;
  /** Scrolls the editor to the spread the client was looking at. */
  onJumpTo: (comment: FeedbackComment) => void;
  onResolve: (commentId: string) => void;
}

/**
 * The photographer's view of what the client said. Each note carries the spread it
 * belongs to and, where the client picked one, the slot — so acting on feedback is
 * a click rather than a hunt through twenty spreads.
 */
export const ClientFeedback = memo(function ClientFeedback({
  feedback,
  loading,
  error,
  resolvingId,
  onJumpTo,
  onResolve,
}: ClientFeedbackProps) {
  if (loading) return <p className="muted">Loading feedback…</p>;

  // Without this the panel claimed there were no comments yet while an error sat
  // right above it — the one reading it cannot tell "none" from "could not ask".
  if (error) {
    return (
      <div className="feedback__failed">
        <p className="error">{error.message}</p>
        <p className="muted">
          Comments could not be loaded, so this list may be incomplete. If the message
          above says the route was not found, the API is running older code than the
          editor — restart it and reload.
        </p>
      </div>
    );
  }

  const comments = feedback?.comments ?? [];
  if (comments.length === 0) {
    return (
      <p className="muted">
        {feedback && feedback.sessions.length > 0
          ? "No comments yet — the share link is open and waiting."
          : "Create a share link and your client's notes will appear here."}
      </p>
    );
  }

  const open = comments.filter((comment) => !comment.resolved);
  const done = comments.filter((comment) => comment.resolved);

  return (
    <div className="feedback">
      <p className="feedback__summary">
        <strong>{open.length}</strong> to act on
        {done.length > 0 && <span className="muted"> · {done.length} done</span>}
      </p>

      <ul className="feedback__list">
        {[...open, ...done].map((comment) => (
          <li
            key={comment.id}
            className={`feedback__item ${comment.resolved ? "feedback__item--resolved" : ""}`}
          >
            <div className="feedback__meta">
              <button
                type="button"
                className="feedback__where"
                title="Jump to this spread"
                onClick={() => onJumpTo(comment)}
              >
                Spread {comment.spreadIndex + 1}
                {comment.slotId && <span className="feedback__slot">· {comment.slotId}</span>}
              </button>
              <span className="muted feedback__who">{comment.clientName}</span>
            </div>

            <p className="feedback__body">{comment.body}</p>

            <div className="feedback__actions">
              <time className="muted" dateTime={comment.createdAt}>
                {formatWhen(comment.createdAt)}
              </time>
              {comment.resolved ? (
                <span className="chip chip--approved">Done</span>
              ) : (
                <button
                  type="button"
                  className="button button--small"
                  disabled={resolvingId === comment.id}
                  onClick={() => onResolve(comment.id)}
                >
                  {resolvingId === comment.id ? "Marking…" : "Mark done"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
});

function formatWhen(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Shared with the editor so a spread can show how many notes point at it. */
export function openCommentsBySpread(comments: FeedbackComment[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const comment of comments) {
    if (comment.resolved) continue;
    counts.set(comment.spreadIndex, (counts.get(comment.spreadIndex) ?? 0) + 1);
  }
  return counts;
}
