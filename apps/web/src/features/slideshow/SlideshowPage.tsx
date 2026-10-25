import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getSlideshowView, recordSlideshowView } from "@/shared/api";
import { LANGUAGES } from "@/shared/i18n/translations";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ClientBrandBar, brandStyle } from "@/shared/ui/ClientBrand";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { SlideshowPlayer } from "./components/SlideshowPlayer";
import { VIEW_REFRESH_MS } from "./lib/autoplay";

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
  const counted = useRef(false);

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

  if (view.isLoading) return <p className="page muted">{t("slideshow.loading")}</p>;
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
        onImageError={() => void view.refetch()}
        onExit={() => {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          setPlaying(false);
        }}
      />
    );
  }

  const cover = data.photos[0];
  return (
    <div className="page slideshow-start" style={brandStyle(data.branding)}>
      <ClientBrandBar branding={data.branding} />
      <header className="page__header">
        <div>
          <p className="muted">{t("slideshow.eyebrow", { name: data.clientName })}</p>
          <h1>{data.projectName}</h1>
          <p className="muted">{t("slideshow.summary", { count: data.photos.length })}</p>
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

      {data.photos.length === 0 ? (
        <p className="notice">{t("slideshow.empty")}</p>
      ) : (
        <button
          type="button"
          className="slideshow-start__cover"
          onClick={() => {
            setPlaying(true);
            // Asked for inside the tap, which is the only moment browsers allow it.
            if (document.fullscreenEnabled) void document.documentElement.requestFullscreen().catch(() => {});
          }}
        >
          {cover && <img src={cover.previewUrl} alt="" />}
          <span className="slideshow-start__play">▶ {t("slideshow.play")}</span>
        </button>
      )}
      <p className="muted slideshow-start__hint">{t("slideshow.hint")}</p>
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
