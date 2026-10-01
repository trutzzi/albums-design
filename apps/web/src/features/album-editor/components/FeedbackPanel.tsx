import { useCallback, useRef } from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { resolveComment, type AlbumFeedback, type FeedbackComment } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ClientFeedback } from "./ClientFeedback";

/** The client's notes on the album, each one jumpable-to and markable as done. */
export function FeedbackPanel(props: {
  albumId: string;
  feedback: UseQueryResult<AlbumFeedback>;
  hidden: boolean;
  onJumpTo: (comment: FeedbackComment) => void;
  photoNumber: (spreadIndex: number, slotId: string) => number | undefined;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { albumId, feedback } = props;
  const resolveFeedback = useMutation({
    mutationFn: (commentId: string) => resolveComment(albumId, commentId),
    onSuccess: (updated) => queryClient.setQueryData(["feedback", albumId], updated),
  });
  // ClientFeedback is memoised, so the handler keeps one identity across renders.
  const resolveRef = useRef(resolveFeedback.mutate);
  resolveRef.current = resolveFeedback.mutate;
  const markCommentDone = useCallback((commentId: string) => resolveRef.current(commentId), []);

  return (
    <section className={`panel ${props.hidden ? "is-hidden" : ""}`}>
      <h2>
        {t("album.feedback.title")}
        {(feedback.data?.openCount ?? 0) > 0 && <span className="panel__badge">{feedback.data?.openCount}</span>}
      </h2>
      {resolveFeedback.isError && <p className="error">{(resolveFeedback.error as Error).message}</p>}
      <ClientFeedback
        feedback={feedback.data}
        loading={feedback.isLoading}
        error={feedback.isError ? (feedback.error as Error) : null}
        resolvingId={resolveFeedback.isPending ? (resolveFeedback.variables ?? null) : null}
        onJumpTo={props.onJumpTo}
        onResolve={markCommentDone}
        photoNumber={props.photoNumber}
      />
    </section>
  );
}
