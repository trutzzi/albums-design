import { useMemo, useRef, useState } from "react";
import { useClientStyle } from "@/shared/ui/ClientBrand";
import { sectionLabel } from "@/shared/lib/client-style";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { downloadZipUrl, getDownloadView, type DownloadScope } from "@/shared/api";
import { LANGUAGES } from "@/shared/i18n/translations";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { PasswordGate, needsPassword } from "@/features/review/components/PasswordGate";
import { PhotoLightbox } from "@/shared/ui/PhotoLightbox";
import { PhotoGallery } from "@/shared/ui/PhotoGallery";
import { GalleryCover } from "@/features/review/components/gallery/GalleryCover";
import { GalleryToolbar } from "@/features/review/components/gallery/GalleryToolbar";
import { GalleryCornerButtons } from "@/features/review/components/gallery/StudioContactCard";
import { filterGallery, filterKey, type GalleryFilter } from "@/features/review/lib/client-gallery";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * The client's side of delivery, laid out like a gallery rather than a form: a cover with
 * the shoot's title, then a bar that stays on screen with the chapters (from photo
 * analysis), the client's favourites (their earlier picks), sharing and the download menu.
 * Behind the password (if the link has one) they look through the photos — a responsive
 * grid, and a slideshow with swipe — and download all of them, one chapter or their
 * favourites at full size, after confirming how long the photos stay available. The
 * download itself is a plain link to the API, so the browser writes the file to disk
 * directly and nothing large ever passes through this page.
 */
export function DownloadPage() {
  const { token = "" } = useParams();
  const { t, language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<DownloadScope | null>(null);
  const [started, setStarted] = useState(false);
  const [slide, setSlide] = useState<number | null>(null);
  const [filter, setFilter] = useState<GalleryFilter>({ kind: "all" });
  const [shareCopied, setShareCopied] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);

  const view = useQuery({
    queryKey: ["download", token],
    queryFn: () => getDownloadView(token),
    retry: false,
    refetchInterval: (query) => ((query.state.data?.processingCount ?? 0) > 0 ? 5000 : false),
  });

  const look = useClientStyle(view.data?.branding);
  const favorites = useMemo(() => new Set(view.data?.favoritePhotoIds ?? []), [view.data?.favoritePhotoIds]);
  const shown = useMemo(
    () => filterGallery(view.data?.photos ?? [], filter, favorites),
    [view.data?.photos, filter, favorites],
  );

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
  const style = data.branding?.style;
  const nameOf = (section: string) => sectionLabel(section, style, t);
  const locale = language === "ro" ? "ro-RO" : "en-GB";
  const until = new Date(data.expiresAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const size = formatSize(data.totalBytes);
  const cover = data.photos.find((photo) => photo.id === data.coverPhotoId) ?? null;
  const counts = {
    all: data.photoCount,
    favorites: data.photos.filter((photo) => favorites.has(photo.id)).length,
    section: filter.kind === "section" ? shown.length : 0,
  };
  const scopeCount = (scope: DownloadScope) =>
    scope.kind === "all" ? counts.all : filterGallery(data.photos, scope, favorites).length;

  const share = async () => {
    const url = window.location.href;
    // The phone's share sheet where there is one; otherwise the link goes to the clipboard.
    if (navigator.share) {
      try {
        await navigator.share({ title: data.projectName, url });
        return;
      } catch {
        // Closing the share sheet is not an error worth showing.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      window.prompt(t("gallery.share"), url);
    }
  };

  const controls = (
    <div className="pick__lang" role="group" aria-label={t("pick.language")}>
      {!look.themeFixed && <ThemeToggle />}
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
  );

  return (
    <div className="download gallery-page client-styled" style={look.style}>
      <GalleryCover
        coverUrl={cover?.previewUrl ?? null}
        title={data.projectName}
        eventDate={data.eventDate}
        branding={data.branding}
        controls={controls}
        onScrollDown={() => galleryRef.current?.scrollIntoView({ behavior: "smooth" })}
      />

      <div className="gallery-page__body" ref={galleryRef}>
        <GalleryToolbar
          sections={data.sections}
          filter={filter}
          onFilter={(next) => {
            setFilter(next);
            setSlide(null);
          }}
          counts={counts}
          expiresOn={until}
          shareCopied={shareCopied}
          onShare={() => void share()}
          onDownload={setConfirming}
          canDownload={data.photoCount > 0}
          sectionName={nameOf}
        />

        <div className="gallery-page__notices">
          <p className="muted">{t("download.summary", { count: data.photoCount, size })}</p>
          <p className="notice">{t("download.available", { date: until, days: data.daysLeft })}</p>
          {data.missingCount > 0 && <p className="notice">{t("download.missing", { count: data.missingCount })}</p>}
          {data.processingCount > 0 && (
            <p className="notice" role="status">
              {t("download.processing", { count: data.processingCount.toLocaleString(locale) })}
            </p>
          )}
          {started && (
            <p className="notice notice--good" role="status">
              {t("download.started")}
            </p>
          )}
        </div>

        {filter.kind === "favorites" && shown.length === 0 && (
          <p className="muted gallery-page__empty">{t("gallery.favorites.empty")}</p>
        )}
        {shown.length > 0 && (
          <PhotoGallery
            photos={shown}
            columnWidth={300}
            onOpen={(_photo, index) => setSlide(index)}
            moreLabel={(remaining) => t("gallery.more", { count: remaining })}
            resetKey={filterKey(filter)}
            layout={style?.grid ?? "masonry"}
            gap={style?.spacing === "airy" ? 24 : 10}
          />
        )}
      </div>

      <GalleryCornerButtons branding={data.branding} />

      {slide !== null && shown[slide] && (
        <PhotoLightbox photos={shown} index={slide} onIndexChange={setSlide} onClose={() => setSlide(null)} />
      )}

      {confirming && (
        <div className="modal-overlay" role="presentation" onClick={() => setConfirming(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="download-confirm-title">
              {confirming.kind === "all" ? t("download.confirm.title") : t("download.confirm.partTitle")}
            </h2>
            <p>{t("download.confirm.available", { date: until, days: data.daysLeft })}</p>
            <p>{t("download.confirm.deleted")}</p>
            <p className="muted">
              {confirming.kind === "all"
                ? t("download.confirm.size", { count: data.photoCount, size })
                : t("download.confirm.partSize", { count: scopeCount(confirming) })}
            </p>
            <div className="modal__actions">
              <button type="button" className="button" onClick={() => setConfirming(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  const scope = confirming;
                  setConfirming(null);
                  setStarted(true);
                  // Navigating to a file response downloads it and leaves this page in place.
                  window.location.assign(downloadZipUrl(token, scope));
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
