import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { addReviewComment, getReview, listLayoutTemplates, submitReviewDecision } from "../../lib/api";
import { SpreadCanvas } from "../../components/SpreadCanvas";

export function ReviewPage() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<number, string>>({});

  const review = useQuery({ queryKey: ["review", token], queryFn: () => getReview(token) });
  const templates = useQuery({ queryKey: ["templates"], queryFn: listLayoutTemplates });

  const comment = useMutation({
    mutationFn: (input: { spreadIndex: number; body: string }) => addReviewComment(token, input),
    onSuccess: (updated) => queryClient.setQueryData(["review", token], updated),
  });

  const decide = useMutation({
    mutationFn: (decision: "APPROVED" | "CHANGES_REQUESTED") =>
      submitReviewDecision(token, decision),
    onSuccess: (updated) => queryClient.setQueryData(["review", token], updated),
  });

  const templateById = useMemo(
    () => new Map((templates.data ?? []).map((template) => [template.id, template])),
    [templates.data],
  );

  if (review.isLoading) return <p className="page muted">Opening your album…</p>;
  if (review.isError) {
    return (
      <div className="page">
        <h1>This link isn&apos;t working</h1>
        <p className="error">{(review.error as Error).message}</p>
        <p className="muted">Ask your photographer for a fresh link.</p>
      </div>
    );
  }
  if (!review.data) return null;

  const { album, session } = review.data;
  const closed = session.status === "APPROVED" || session.status === "REVOKED";
  const aspectRatio = (album.format.pageWidthMm * 2) / album.format.pageHeightMm;

  return (
    <div className="page review">
      <header className="page__header">
        <div>
          <p className="muted">Album proof for {session.clientName}</p>
          <h1>{album.title}</h1>
          <p className="muted">
            {album.spreads.length} spreads · your notes go straight to your photographer
          </p>
        </div>
        <span className={`chip chip--${session.status.toLowerCase()}`}>{session.status}</span>
      </header>

      {session.status === "APPROVED" && (
        <p className="notice notice--good">
          You approved this album. Your photographer has been notified.
        </p>
      )}
      {session.status === "CHANGES_REQUESTED" && (
        <p className="notice">
          Your change requests were sent. You&apos;ll get a new link when the album is updated.
        </p>
      )}

      <div className="spreads">
        {album.spreads.map((spread, spreadIndex) => {
          const spreadComments = session.comments.filter(
            (item) => item.spreadIndex === spreadIndex,
          );
          return (
            <section key={spreadIndex} className="spread-block">
              <div className="spread-block__head">
                <h2>Spread {spreadIndex + 1}</h2>
              </div>

              <SpreadCanvas
                template={templateById.get(spread.templateId)}
                placements={spread.placements}
                previewUrlFor={(photoId) =>
                  spread.placements.find((placement) => placement.photoId === photoId)?.previewUrl
                }
                aspectRatio={aspectRatio}
              />

              <div className="comments">
                {spreadComments.map((item) => (
                  <p key={item.id} className={item.resolved ? "comment comment--resolved" : "comment"}>
                    <strong>{item.authorName}:</strong> {item.body}
                  </p>
                ))}
                {!closed && (
                  <form
                    className="comment-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const body = (draft[spreadIndex] ?? "").trim();
                      if (!body) return;
                      comment.mutate({ spreadIndex, body });
                      setDraft((prev) => ({ ...prev, [spreadIndex]: "" }));
                    }}
                  >
                    <input
                      id={`comment-${spreadIndex}`}
                      value={draft[spreadIndex] ?? ""}
                      placeholder="Ask for a swap, a crop, a different moment…"
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, [spreadIndex]: event.target.value }))
                      }
                    />
                    <button type="submit" className="button button--small">
                      Add note
                    </button>
                  </form>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {!closed && (
        <footer className="review__actions">
          {decide.isError && <p className="error">{(decide.error as Error).message}</p>}
          <button
            type="button"
            className="button"
            disabled={decide.isPending}
            onClick={() => decide.mutate("CHANGES_REQUESTED")}
          >
            Request changes
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={decide.isPending}
            onClick={() => decide.mutate("APPROVED")}
          >
            Approve album
          </button>
        </footer>
      )}
    </div>
  );
}
