import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getSlideshowView, recordSlideshowView } from "@/shared/api";
import { LANGUAGES } from "@/shared/i18n/translations";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { brandStyle } from "@/shared/ui/ClientBrand";
import { ContactDialog, hasContact } from "@/features/review/components/gallery/StudioContactCard";
import { SlideshowPlayer } from "./components/SlideshowPlayer";
import { VIEW_REFRESH_MS, shouldRetryImage } from "./lib/autoplay";
import { ClientPageSkeleton } from "@/shared/ui/Loading";

/**
 * The page a client — or anyone they forward it to — opens from a slideshow link. No
 * password, on purpose. It opens on a title card rather than straight into playback:
 * full screen and keeping the screen awake both need a tap first, and the card is where
 * the studio's name sits.
 */
export function SlideshowPage() {
  const { token = "" } = useParams();
  const { t, language, setLanguage } = useLanguage();
  const [playing, setPlaying] = useState(false);
  const [shared, setShared] = useState(false);
  // Where copying is refused (some in-app browsers), the link is shown to copy by hand.
  const [manualLink, setManualLink] = useState<string | null>(null);
  const sharedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(sharedTimer.current), []);
  const [contactOpen, setContactOpen] = useState(false);
  const counted = useRef(false);
  const imageRetries = useRef(new Map<string, number>());

  const view = useQuery({
    queryKey: ["slideshow", token],
    queryFn: () => getSlideshowView(token),
    retry: false,
    // Fresh preview URLs before the old ones expire, so a slideshow left on a TV keeps going.
    refetchInterval: VIEW_REFRESH_MS,
    refetchIntervalInBackground: true,
  });

  useNoIndex();

  // One view per opening of the page; refetches are not views.
  useEffect(() => {
    if (!view.data || counted.current) return;
    counted.current = true;
    void recordSlideshowView(token).catch(() => {});
  }, [view.data, token]);

  if (view.isLoading) return <ClientPageSkeleton label={t("slideshow.loading")} body="cover" />;
  if (view.isError || !view.data) {
    return (
      <div className="page">
        <h1>{t("slideshow.error.title")}</h1>
        <p className="error">{(view.error as Error | null)?.message}</p>
        <p className="muted">{t("slideshow.error.hint")}</p>
      </div>
    );
  }

  const data = view.data;
  if (playing && data.photos.length > 0) {
    return (
      <SlideshowPlayer
        photos={data.photos}
        settings={data.settings}
        onImageError={(photoId) => {
          if (shouldRetryImage(photoId, Date.now(), imageRetries.current)) void view.refetch();
        }}
        onExit={() => {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          setPlaying(false);
        }}
      />
    );
  }

  const cover = data.photos[0];
  const play = () => {
    setPlaying(true);
    // Asked for inside the tap, which is the only moment browsers allow it.
    if (document.fullscreenEnabled) void document.documentElement.requestFullscreen().catch(() => {});
  };
  const share = async () => {
    const url = window.location.href;
    // The phone's share sheet where there is one; otherwise the link goes to the clipboard.
    if (navigator.share) {
      try {
        await navigator.share({ title: data.projectName, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.clearTimeout(sharedTimer.current);
      sharedTimer.current = window.setTimeout(() => setShared(false), 2500);
    } catch {
      setManualLink(url);
    }
  };

  return (
    <div className="slideshow-start" style={brandStyle(data.branding)}>
      <div className="slideshow-start__top">
        <span className="slideshow-start__studio">{data.branding?.name ?? ""}</span>
        <div className="pick__lang" role="group" aria-label={t("pick.language")}>
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
      </div>

      <div className="slideshow-start__cover">
        {cover && <img src={cover.previewUrl} alt="" />}
        <div className="slideshow-start__overlay">
          <p className="slideshow-start__eyebrow">{t("slideshow.eyebrow", { name: data.clientName })}</p>
          <h1>{data.projectName}</h1>
          <p className="slideshow-start__summary">{t("slideshow.summary", { count: data.photos.length })}</p>
          {data.photos.length === 0 ? (
            <p className="notice">{t("slideshow.empty")}</p>
          ) : (
            <button type="button" className="slideshow-start__play" onClick={play}>
              <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
                <path d="M5 3.5v11l9-5.5-9-5.5Z" fill="currentColor" />
              </svg>
              {t("slideshow.play")}
            </button>
          )}
        </div>
      </div>

      <p className="slideshow-start__hint">{t("slideshow.hint")}</p>
      <div className="slideshow-start__actions">
        <button type="button" className="slideshow-start__action" onClick={() => void share()}>
          {shared ? t("slideshow.shared") : t("slideshow.share")}
        </button>
        {hasContact(data.branding) && (
          <button type="button" className="slideshow-start__action" onClick={() => setContactOpen(true)}>
            {t("slideshow.contact")}
          </button>
        )}
      </div>
      <span className="visually-hidden" role="status">
        {shared ? t("slideshow.shared") : ""}
      </span>
      {manualLink && (
        <label className="slideshow-start__manual">
          <span>{t("slideshow.copyManually")}</span>
          <input readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      {contactOpen && hasContact(data.branding) && (
        <ContactDialog branding={data.branding} onClose={() => setContactOpen(false)} />
      )}
    </div>
  );
}

/** The link has no password and is made to be forwarded; keep it out of search results. */
function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}
