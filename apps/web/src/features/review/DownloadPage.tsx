import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { downloadZipUrl, getDownloadView } from "../../lib/api";
import { LANGUAGES } from "../../lib/i18n/translations";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import { PasswordGate, needsPassword } from "../../components/PasswordGate";
import { PhotoLightbox } from "../../components/PhotoLightbox";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * The client's side of delivery. Behind the password (if the link has one) they
 * can look through every photo — a responsive grid, and a slideshow with swipe —
 * before pressing the one button that downloads them all at full size, which
 * asks them to confirm how long the photos stay available. The download itself
 * is a plain link to the API, so the browser writes the file to disk directly
 * and nothing large ever passes through this page.
 */
export function DownloadPage() {
  const { token = "" } = useParams();
  const { t, language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [started, setStarted] = useState(false);
  const [slide, setSlide] = useState<number | null>(null);

  const view = useQuery({
    queryKey: ["download", token],
    queryFn: () => getDownloadView(token),
    retry: false,
  });

  if (view.isLoading) return <p className="page muted">{t("download.loading")}</p>;
  if (needsPassword(view.error)) {
    return (
      <PasswordGate
        kind="download"
        token={token}
        onUnlocked={() => void queryClient.invalidateQueries({ queryKey: ["download", token] })}
      />
    );
  }
  if (view.isError || !view.data) {
    return (
      <div className="page">
        <h1>{t("download.error.title")}</h1>
        <p className="error">{(view.error as Error | null)?.message}</p>
        <p className="muted">{t("download.error.hint")}</p>
      </div>
    );
  }

  const data = view.data;
  const until = new Date(data.expiresAt).toLocaleDateString(language === "ro" ? "ro-RO" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const size = formatSize(data.totalBytes);

  return (
    <div className="page download">
      <header className="page__header">
        <div>
          <p className="muted">{t("download.eyebrow", { name: data.clientName })}</p>
          <h1>{data.projectName}</h1>
          <p className="muted">{t("download.summary", { count: data.photoCount, size })}</p>
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

      <p className="notice">{t("download.available", { date: until, days: data.daysLeft })}</p>
      {data.missingCount > 0 && <p className="notice">{t("download.missing", { count: data.missingCount })}</p>}
      {started && (
        <p className="notice notice--good" role="status">
          {t("download.started")}
        </p>
      )}

      {data.photos.length > 0 && (
        <>
          <h2 className="download__grid-title">{t("download.grid.title")}</h2>
          <p className="muted">{t("download.grid.hint")}</p>
          <div className="pick__grid">
            {data.photos.map((photo, index) => (
              <figure key={photo.id} className="pick__card">
                <button
                  type="button"
                  className="pick__image"
                  aria-label={photo.fileName}
                  onClick={() => setSlide(index)}
                >
                  <img src={photo.thumbnailUrl} alt={photo.fileName} loading="lazy" decoding="async" />
                </button>
              </figure>
            ))}
          </div>
        </>
      )}

      <div className="pick__bar">
        <span className="pick__counter">{t("download.summary", { count: data.photoCount, size })}</span>
        <button
          type="button"
          className="button button--primary"
          disabled={data.photoCount === 0}
          onClick={() => setConfirming(true)}
        >
          {t("download.button", { size })}
        </button>
      </div>

      {slide !== null && (
        <PhotoLightbox photos={data.photos} index={slide} onIndexChange={setSlide} onClose={() => setSlide(null)} />
      )}

      {confirming && (
        <div className="modal-overlay" role="presentation" onClick={() => setConfirming(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="download-confirm-title">{t("download.confirm.title")}</h2>
            <p>{t("download.confirm.available", { date: until, days: data.daysLeft })}</p>
            <p>{t("download.confirm.deleted")}</p>
            <p className="muted">{t("download.confirm.size", { count: data.photoCount, size })}</p>
            <div className="modal__actions">
              <button type="button" className="button" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  setConfirming(false);
                  setStarted(true);
                  // Navigating to a file response downloads it and leaves this page in place.
                  window.location.assign(downloadZipUrl(token));
                }}
              >
                {t("download.confirm.yes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
