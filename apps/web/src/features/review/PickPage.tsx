import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getPickView, setPhotoPicked, submitPicks, type PickView } from "../../lib/api";
import { LANGUAGES } from "../../lib/i18n/translations";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import { PhotoLightbox } from "../../components/PhotoLightbox";
import { PasswordGate, needsPassword } from "../../components/PasswordGate";

type Filter = "all" | "picked";

/**
 * The client's side of photo selection: a private gallery reached only by its
 * share token. Everything shown is a display copy — the originals never leave
 * the photographer's storage — and a pick is saved the moment it is tapped, so
 * a dropped connection loses at most the last tap.
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

  const view = useQuery({ queryKey, queryFn: () => getPickView(token), retry: false });

  const toggle = useMutation({
    mutationFn: ({ photoId, picked }: { photoId: string; picked: boolean }) =>
      setPhotoPicked(token, photoId, picked),
    onMutate: async ({ photoId, picked }) => {
      setNotice(null);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PickView>(queryKey);
      if (previous) {
        const ids = previous.session.pickedPhotoIds.filter((id) => id !== photoId);
        queryClient.setQueryData<PickView>(queryKey, {
          ...previous,
          session: { ...previous.session, pickedPhotoIds: picked ? [...ids, photoId] : ids },
        });
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      // Roll the heart back and say why — most often the photo limit.
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setNotice((error as Error).message);
    },
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
  const picked = useMemo(() => new Set(data?.session.pickedPhotoIds ?? []), [data]);
  const visible = useMemo(
    () => (data?.photos ?? []).filter((photo) => filter === "all" || picked.has(photo.id)),
    [data, filter, picked],
  );
  const isOpen = data?.session.status === "OPEN";

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
  const count = session.pickedPhotoIds.length;
  const counter =
    session.pickLimit === null
      ? t("pick.counter", { count })
      : t("pick.counterLimit", { count, limit: session.pickLimit });

  const heart = (photoId: string, className: string) => {
    const isPicked = picked.has(photoId);
    return (
      <button
        type="button"
        className={`${className} ${isPicked ? "pick-heart--on" : ""}`}
        aria-pressed={isPicked}
        aria-label={isPicked ? t("pick.heart.unpick") : t("pick.heart.pick")}
        disabled={!isOpen}
        onClick={(event) => {
          event.stopPropagation();
          toggle.mutate({ photoId, picked: !isPicked });
        }}
      >
        {isPicked ? "♥" : "♡"}
      </button>
    );
  };

  return (
    <div className="page pick">
      <header className="page__header">
        <div>
          <p className="muted">{t("pick.eyebrow", { name: session.clientName })}</p>
          <h1>{data.projectName}</h1>
          {isOpen && <p className="muted">{t("pick.intro")}</p>}
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

      {session.status === "SUBMITTED" && (
        <p className="notice notice--good" role="status">
          <strong>{t("pick.done.title", { name: session.clientName })}</strong>{" "}
          {t("pick.done.body", { count })}
        </p>
      )}
      {notice && <p className="error" role="alert">{notice}</p>}

      <div className="pick__filters" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={`pick__filter ${filter === "all" ? "pick__filter--on" : ""}`}
          onClick={() => setFilter("all")}
        >
          {t("pick.filter.all", { count: data.photos.length })}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "picked"}
          className={`pick__filter ${filter === "picked" ? "pick__filter--on" : ""}`}
          onClick={() => setFilter("picked")}
        >
          {t("pick.filter.picked", { count })}
        </button>
      </div>

      {data.photos.length === 0 && <p className="muted">{t("pick.empty")}</p>}
      {data.photos.length > 0 && visible.length === 0 && (
        <p className="muted">{t("pick.emptyPicked")}</p>
      )}

      <div className="pick__grid">
        {visible.map((photo) => (
          <figure key={photo.id} className={`pick__card ${picked.has(photo.id) ? "pick__card--on" : ""}`}>
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
          <button
            type="button"
            className="button button--primary"
            disabled={count === 0 || submit.isPending}
            onClick={() => setConfirming(true)}
          >
            {submit.isPending ? t("pick.submitting") : t("pick.submit")}
          </button>
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
