import type { ReactNode } from "react";
import { DEFAULT_CLIENT_STYLE, type ClientBrandingDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { localeOf } from "@/shared/i18n/locale";
import { displayWebsite } from "@/features/review/lib/client-gallery";
import { SocialLinks } from "./SocialLinks";

/**
 * The first screen of a delivery: the cover photo and the shoot's date, title and
 * photographer, with an arrow down to the photos. A Studio Pro studio chooses whether the
 * photo sits left, right or fills the screen behind the title, and may add a welcome note
 * and its social links. Stacks on a phone.
 */
export function GalleryCover({
  coverUrl,
  title,
  eventDate,
  branding,
  controls,
  onScrollDown,
}: {
  coverUrl: string | null;
  title: string;
  eventDate: string | null;
  branding: ClientBrandingDTO | null;
  /** Language and theme switches, in the corner. */
  controls: ReactNode;
  onScrollDown: () => void;
}) {
  const { t, language } = useLanguage();
  const style = branding?.style ?? DEFAULT_CLIENT_STYLE;
  const date = eventDate
    ? new Date(eventDate).toLocaleDateString(localeOf(language), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const layout = coverUrl ? style.coverLayout : "plain";

  return (
    <header className={`gallery-cover gallery-cover--${layout}`}>
      {coverUrl && (
        <div className="gallery-cover__photo">
          <img src={coverUrl} alt="" />
        </div>
      )}
      <div className="gallery-cover__text">
        <div className="gallery-cover__controls">{controls}</div>
        {branding?.logo && <img src={branding.logo} alt={branding.name} className="gallery-cover__logo" />}
        {date && <p className="gallery-cover__date">{date}</p>}
        <h1 className="gallery-cover__title">{title}</h1>
        {branding && (
          <p className="gallery-cover__by">
            <span>{t("gallery.cover.photographer", { name: branding.name })}</span>
            {branding.website && (
              <>
                <span aria-hidden="true" className="gallery-cover__divider">
                  |
                </span>
                <a href={branding.website} target="_blank" rel="noopener noreferrer">
                  {displayWebsite(branding.website)}
                </a>
              </>
            )}
          </p>
        )}
        {style.welcomeMessage && <p className="gallery-cover__welcome">{style.welcomeMessage}</p>}
        {branding && <SocialLinks social={style.social} />}
        <button
          type="button"
          className="gallery-cover__scroll"
          aria-label={t("gallery.cover.scroll")}
          onClick={onScrollDown}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 4v15m0 0-6-6m6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>
    </header>
  );
}
