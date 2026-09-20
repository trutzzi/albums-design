import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getPickView, setPhotoPicked, setPickStage, submitPicks, type PickView } from "../../lib/api";
import { LANGUAGES } from "../../lib/i18n/translations";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import { PhotoLightbox } from "../../components/PhotoLightbox";
import { PasswordGate, needsPassword } from "../../components/PasswordGate";

type Filter = "all" | "picked";

/**
 * The client's side of photo selection: a private gallery reached only by its share
 * token. Everything shown is a display copy — the originals never leave the
 * photographer's storage — and a tap is saved immediately, so a dropped connection
 * loses at most the last one.
 *
 * Choosing 60 out of 2,000 in one pass is where clients stall, so it happens in two
 * steps: mark anything you might want (no limit), then narrow that shortlist down to
 * the photographer's limit. The heart means "maybe" in step 1 and "yes" in step 2;
 * which list a tap lands in is decided by the server from the step the session is on.
 */
export function PickPage() {
  const { token = "" } = useParams();
  const { t, language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["pick", token], [token]);
  const [filter, setFilter] = useState<Filter>("all");
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const view = useQuery({
    queryKey,
    queryFn: () => getPickView(token),
    retry: false,
    // While the photographer's upload is still being processed the gallery keeps growing;
    // check again every few seconds so new photos appear on their own.
    refetchInterval: (query) => ((query.state.data?.processingCount ?? 0) > 0 ? 5000 : false),
  });

  const stage = view.data?.session.stage ?? "SHORTLIST";
  const onShortlist = stage === "SHORTLIST";

  const toggle = useMutation({
    mutationFn: ({ photoId, picked }: { photoId: string; picked: boolean }) =>
      setPhotoPicked(token, photoId, picked),
    onMutate: async ({ photoId, picked }) => {
      setNotice(null);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PickView>(queryKey);
      if (previous) {
        // The heart belongs to whichever list this step is about.
        const key = onShortlist ? "shortlistedPhotoIds" : "pickedPhotoIds";
        const ids = previous.session[key].filter((id) => id !== photoId);
        const next = { ...previous.session, [key]: picked ? [...ids, photoId] : ids };
        // Dropping a photo from the shortlist drops it from the final picks too, the
        // same rule the server applies.
        if (onShortlist && !picked) next.pickedPhotoIds = next.pickedPhotoIds.filter((id) => id !== photoId);
        queryClient.setQueryData<PickView>(queryKey, { ...previous, session: next });
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      // Roll the heart back and say why — most often the photo limit.
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setNotice((error as Error).message);
    },
  });

  const changeStage = useMutation({
    mutationFn: (next: "SHORTLIST" | "FINAL") => setPickStage(token, next),
    onSuccess: (state) => {
      setNotice(null);
      setFilter("all");
      const previous = queryClient.getQueryData<PickView>(queryKey);
      if (previous) queryClient.setQueryData<PickView>(queryKey, { ...previous, session: state });
    },
    onError: (error) => setNotice((error as Error).message),
  });

  const submit = useMutation({
    mutationFn: () => submitPicks(token),
    onSuccess: (state) => {
      setConfirming(false);
      const previous = queryClient.getQueryData<PickView>(queryKey);
      if (previous) queryClient.setQueryData<PickView>(queryKey, { ...previous, session: state });
    },
    onError: (error) => {
      setConfirming(false);
      setNotice((error as Error).message);
    },
  });

  const data = view.data;
  const shortlisted = useMemo(() => new Set(data?.session.shortlistedPhotoIds ?? []), [data]);
  const picked = useMemo(() => new Set(data?.session.pickedPhotoIds ?? []), [data]);
  /** What the heart reflects on this step. */
  const marked = onShortlist ? shortlisted : picked;
  /** Step 2 only ever shows what survived step 1. */
  const gallery = useMemo(
    () => (onShortlist ? (data?.photos ?? []) : (data?.photos ?? []).filter((photo) => shortlisted.has(photo.id))),
    [data, onShortlist, shortlisted],
  );
  const visible = useMemo(
    () => gallery.filter((photo) => filter === "all" || marked.has(photo.id)),
    [gallery, filter, marked],
  );
  const isOpen = data?.session.status === "OPEN";
  const busy = toggle.isPending || changeStage.isPending || submit.isPending;

  const lightboxIndex = lightboxId ? visible.findIndex((photo) => photo.id === lightboxId) : -1;

  if (view.isLoading) return <p className="page muted">{t("pick.loading")}</p>;
  if (needsPassword(view.error)) {
    return (
      <PasswordGate
        kind="pick"
        token={token}
        onUnlocked={() => void queryClient.invalidateQueries({ queryKey })}
      />
    );
  }
  if (view.isError || !data) {
    return (
      <div className="page">
        <h1>{t("pick.error.title")}</h1>
        <p className="error">{(view.error as Error | null)?.message}</p>
        <p className="muted">{t("pick.error.hint")}</p>
      </div>
    );
  }

  const { session } = data;
  const shortlistCount = session.shortlistedPhotoIds.length;
  const count = session.pickedPhotoIds.length;
  const counter = onShortlist
    ? t("pick.counter.shortlisted", { count: shortlistCount })
    : session.pickLimit === null
      ? t("pick.counter", { count })
      : t("pick.counterLimit", { count, limit: session.pickLimit });

  const heart = (photoId: string, className: string) => {
    const isMarked = marked.has(photoId);
    const label = onShortlist
      ? isMarked
        ? t("pick.heart.unshortlist")
        : t("pick.heart.shortlist")
      : isMarked
        ? t("pick.heart.unpick")
        : t("pick.heart.pick");
    return (
      <button
        type="button"
        className={`${className} ${isMarked ? "pick-heart--on" : ""}`}
        aria-pressed={isMarked}
        aria-label={label}
        title={label}
        disabled={!isOpen}
        onClick={(event) => {
          event.stopPropagation();
          toggle.mutate({ photoId, picked: !isMarked });
        }}
      >
        {isMarked ? "♥" : "♡"}
      </button>
    );
  };

  return (
    <div className="page pick">
      <header className="page__header">
        <div>
          <p className="muted">{t("pick.eyebrow", { name: session.clientName })}</p>
          <h1>{data.projectName}</h1>
        </div>
        <div className="pick__lang" role="group" aria-label={t("pick.language")}>
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

      {isOpen && (
        <>
          <ol className="pick__steps">
            <li className={`pick__step ${onShortlist ? "pick__step--on" : "pick__step--done"}`}>
              <span className="pick__step-number">1</span>
              {t("pick.step.shortlist")}
            </li>
            <li className={`pick__step ${onShortlist ? "" : "pick__step--on"}`}>
              <span className="pick__step-number">2</span>
              {t("pick.step.final")}
            </li>
          </ol>
          <p className="muted">
            {onShortlist
              ? t("pick.shortlist.intro")
              : session.pickLimit === null
                ? t("pick.final.introNoLimit", { shortlisted: shortlistCount })
                : t("pick.final.intro", { limit: session.pickLimit, shortlisted: shortlistCount })}
          </p>
        </>
      )}

      {session.status === "SUBMITTED" && (
        <p className="notice notice--good" role="status">
          <strong>{t("pick.done.title", { name: session.clientName })}</strong>{" "}
          {t("pick.done.body", { count })}
        </p>
      )}
      {notice && <p className="error" role="alert">{notice}</p>}
      {data.processingCount > 0 && (
        <p className="notice" role="status">
          {t("pick.processing", { count: data.processingCount.toLocaleString(language === "ro" ? "ro-RO" : "en-GB") })}
        </p>
      )}

      <div className="pick__filters" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={`pick__filter ${filter === "all" ? "pick__filter--on" : ""}`}
          onClick={() => setFilter("all")}
        >
          {onShortlist
            ? t("pick.filter.all", { count: data.photos.length })
            : t("pick.filter.shortlisted", { count: gallery.length })}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "picked"}
          className={`pick__filter ${filter === "picked" ? "pick__filter--on" : ""}`}
          onClick={() => setFilter("picked")}
        >
          {onShortlist
            ? t("pick.filter.shortlisted", { count: shortlistCount })
            : t("pick.filter.chosen", { count })}
        </button>
      </div>

      {data.photos.length === 0 && <p className="muted">{t("pick.empty")}</p>}
      {data.photos.length > 0 && visible.length === 0 && (
        <p className="muted">{onShortlist ? t("pick.emptyPicked") : t("pick.emptyChosen")}</p>
      )}

      <div className="pick__grid">
        {visible.map((photo) => (
          <figure key={photo.id} className={`pick__card ${marked.has(photo.id) ? "pick__card--on" : ""}`}>
            <button type="button" className="pick__image" onClick={() => setLightboxId(photo.id)}>
              <img src={photo.thumbnailUrl} alt={photo.fileName} loading="lazy" decoding="async" />
            </button>
            {heart(photo.id, "pick-heart")}
          </figure>
        ))}
      </div>

      <div className="pick__bar">
        <span className="pick__counter">{counter}</span>
        {isOpen && (
          <div className="pick__bar-actions">
            {!onShortlist && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => changeStage.mutate("SHORTLIST")}
              >
                {t("pick.back")}
              </button>
            )}
            {onShortlist ? (
              <button
                type="button"
                className="button button--primary"
                disabled={shortlistCount === 0 || busy}
                onClick={() => changeStage.mutate("FINAL")}
              >
                {changeStage.isPending ? t("common.loading") : t("pick.continue", { count: shortlistCount })}
              </button>
            ) : (
              <button
                type="button"
                className="button button--primary"
                disabled={count === 0 || busy}
                onClick={() => setConfirming(true)}
              >
                {submit.isPending ? t("pick.submitting") : t("pick.submit")}
              </button>
            )}
          </div>
        )}
      </div>

      {lightboxIndex >= 0 && (
        <PhotoLightbox
          photos={visible}
          index={lightboxIndex}
          onIndexChange={(next) => setLightboxId(visible[next]?.id ?? null)}
          onClose={() => setLightboxId(null)}
          controls={(photo) => heart(photo.id, "pick-heart pick-heart--large")}
        />
      )}

      {confirming && (
        <div className="modal-overlay" role="presentation" onClick={() => !submit.isPending && setConfirming(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pick-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="pick-confirm-title">{t("pick.confirm.title")}</h2>
            <p>{t("pick.confirm.body", { count })}</p>
            <div className="modal__actions">
              <button type="button" className="button" disabled={submit.isPending} onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={submit.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? t("pick.submitting") : t("pick.confirm.yes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
