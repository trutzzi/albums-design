import { useMemo, useState } from "react";
import { ClientBrandBar, brandStyle } from "../../components/ClientBrand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { addReviewComment, getReview, listLayoutTemplates, submitReviewDecision } from "../../lib/api";
import { SpreadCanvas } from "../../components/SpreadCanvas";
import { CoverPreview } from "../../components/CoverEditor";
import { BookPreview } from "../../components/BookPreview";
import { PasswordGate, needsPassword } from "../../components/PasswordGate";
import { ThemeToggle } from "../../components/ThemeToggle";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { LANGUAGES } from "../../lib/i18n/translations";

export function ReviewPage() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const { t, language, setLanguage } = useLanguage();
  const [draft, setDraft] = useState<Record<number, string>>({});
  // The photo a client tapped, so their next note on that spread is pinned to it.
  const [pinned, setPinned] = useState<{ spreadIndex: number; slotId: string } | null>(null);
  const [asBook, setAsBook] = useState(false);

  const review = useQuery({ queryKey: ["review", token], queryFn: () => getReview(token), retry: false });
  const templates = useQuery({ queryKey: ["templates"], queryFn: listLayoutTemplates });

  const comment = useMutation({
    mutationFn: (input: { spreadIndex: number; slotId?: string; body: string }) => addReviewComment(token, input),
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

  if (review.isLoading) return <p className="page muted">{t("review.opening")}</p>;
  if (needsPassword(review.error)) {
    return (
      <PasswordGate
        kind="review"
        token={token}
        onUnlocked={() => void queryClient.invalidateQueries({ queryKey: ["review", token] })}
      />
    );
  }
  if (review.isError) {
    return (
      <div className="page">
        <h1>{t("review.broken.title")}</h1>
        <p className="error">{(review.error as Error).message}</p>
        <p className="muted">{t("review.broken.body")}</p>
      </div>
    );
  }
  if (!review.data) return null;

  const { album, session } = review.data;
  const closed = session.status === "APPROVED" || session.status === "REVOKED";
  const aspectRatio = (album.format.pageWidthMm * 2) / album.format.pageHeightMm;

  return (
    <div className="page review" style={brandStyle(album.branding)}>
      <ClientBrandBar branding={album.branding} />
      <header className="page__header">
        <div>
          <p className="muted">{t("review.eyebrow", { name: session.clientName })}</p>
          <h1>{album.title}</h1>
          <p className="muted">{t("review.subtitle", { count: album.spreads.length })}</p>
          <button type="button" className="button button--primary review__book" onClick={() => setAsBook(true)}>
            {t("review.viewAsBook")}
          </button>
        </div>
        <div className="pick__lang" role="group" aria-label={t("pick.language")}>
          <span className={`chip chip--${session.status.toLowerCase()}`}>{t(`review.status.${session.status}`)}</span>
          <ThemeToggle />
          {LANGUAGES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`link-button ${language === option.value ? "pick__lang--on" : ""}`}
              onClick={() => setLanguage(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {asBook && (
        <BookPreview
          album={album}
          templateById={templateById}
          watermark={album.watermark}
          previewUrlFor={(photoId) =>
            album.cover?.photoId === photoId
              ? album.cover.previewUrl
              : album.spreads.flatMap((spread) => spread.placements).find((placement) => placement.photoId === photoId)?.previewUrl
          }
          focusFor={(photoId) =>
            album.cover?.photoId === photoId
              ? album.cover.focus
              : album.spreads.flatMap((spread) => spread.placements).find((placement) => placement.photoId === photoId)?.focus
          }
          onClose={() => setAsBook(false)}
        />
      )}

      {album.cover && (
        <section className="review-cover">
          <h2>{t("review.cover")}</h2>
          <div className={album.watermark ? "proof-watermark" : undefined}>
            <CoverPreview
              cover={album.cover}
              albumStyle={album.style}
              aspectRatio={album.format.pageWidthMm / album.format.pageHeightMm}
              previewUrl={album.cover.previewUrl}
              focus={album.cover.focus}
            />
          </div>
        </section>
      )}

      {!closed && (
        <p className="muted review__hint">
          {t("review.hint")}
        </p>
      )}

      {session.status === "APPROVED" && (
        <p className="notice notice--good">
          {t("review.approved")}
        </p>
      )}
      {session.status === "CHANGES_REQUESTED" && (
        <p className="notice">
          {t("review.changesSent")}
        </p>
      )}

      <div className="spreads">
        {album.spreads.map((spread, spreadIndex) => {
          const spreadComments = session.comments.filter(
            (item) => item.spreadIndex === spreadIndex,
          );
          const template = templateById.get(spread.templateId);
          // Photos are numbered in the layout's reading order — the numbers on the badges.
          const photoNumber = (slotId: string) => (template?.slots.findIndex((slot) => slot.id === slotId) ?? -1) + 1;
          const slotBadges = Object.fromEntries(
            spreadComments.filter((item) => item.slotId).map((item) => [item.slotId!, photoNumber(item.slotId!)]),
          );
          const pinnedSlot = pinned?.spreadIndex === spreadIndex ? pinned.slotId : null;
          return (
            <section key={spreadIndex} className="spread-block">
              <div className="spread-block__head">
                <h2>{t("review.spread", { number: spreadIndex + 1 })}</h2>
              </div>

              <div className={album.watermark ? "proof-watermark" : undefined}>
                <SpreadCanvas
                  spreadIndex={spreadIndex}
                  template={template}
                  placements={spread.placements}
                  albumStyle={album.style}
                  texts={spread.texts}
                  slotBadges={slotBadges}
                  selectedSlotId={pinnedSlot}
                  onSlotClick={
                    closed
                      ? undefined
                      : (slotId) =>
                          setPinned((current) =>
                            current?.spreadIndex === spreadIndex && current.slotId === slotId
                              ? null
                              : { spreadIndex, slotId },
                          )
                  }
                  previewUrlFor={(photoId) =>
                    spread.placements.find((placement) => placement.photoId === photoId)?.previewUrl
                  }
                  focusFor={(photoId) =>
                    spread.placements.find((placement) => placement.photoId === photoId)?.focus
                  }
                  aspectRatio={aspectRatio}
                  pageWidthMm={album.format.pageWidthMm}
                  pageHeightMm={album.format.pageHeightMm}
                />
              </div>

              <div className="comments">
                {spreadComments.map((item) => (
                  <p key={item.id} className={item.resolved ? "comment comment--resolved" : "comment"}>
                    {item.slotId && <span className="comment__pin">{t("review.photo", { number: photoNumber(item.slotId) })}</span>}
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
                      comment.mutate({ spreadIndex, body, ...(pinnedSlot ? { slotId: pinnedSlot } : {}) });
                      setDraft((prev) => ({ ...prev, [spreadIndex]: "" }));
                      setPinned(null);
                    }}
                  >
                    {pinnedSlot && (
                      <button
                        type="button"
                        className="comment__pin comment__pin--active"
                        title={t("review.unpin")}
                        onClick={() => setPinned(null)}
                      >
                        {t("review.photo", { number: photoNumber(pinnedSlot) })} ✕
                      </button>
                    )}
                    <input
                      id={`comment-${spreadIndex}`}
                      value={draft[spreadIndex] ?? ""}
                      placeholder={pinnedSlot ? t("review.placeholder.photo") : t("review.placeholder")}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, [spreadIndex]: event.target.value }))
                      }
                    />
                    <button type="submit" className="button button--small">
                      {t("review.addNote")}
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
            {t("review.requestChanges")}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={decide.isPending}
            onClick={() => decide.mutate("APPROVED")}
          >
            {t("review.approve")}
          </button>
        </footer>
      )}
    </div>
  );
}
