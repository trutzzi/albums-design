import type { DownloadScope } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { countKey, localeOf } from "@/shared/i18n/locale";
import { formatBytes } from "@/features/review/lib/client-gallery";
import { GalleryMenu } from "./GalleryMenu";

export interface DownloadChoices {
  all: { count: number; bytes: number };
  /** The chapter on screen, when the client is looking at one. */
  section: { key: string; name: string; count: number; bytes: number } | null;
  favorites: { count: number; bytes: number };
}

/**
 * What a client can download: everything, the chapter they are looking at, or their
 * favourites — each with how many photos and how big the file is, so a phone on mobile
 * data can choose sensibly. Opens as a sheet from the bottom on a phone.
 */
export function DownloadMenu({
  choices,
  disabled,
  onDownload,
  className,
}: {
  choices: DownloadChoices;
  disabled: boolean;
  onDownload: (scope: DownloadScope) => void;
  className: string;
}) {
  const { t, language } = useLanguage();
  const locale = localeOf(language);
  const detail = (count: number, bytes: number) => {
    const photos = t(countKey("gallery.photos", count, language), { count: count.toLocaleString(locale) });
    return bytes > 0 ? t("gallery.download.detail", { photos, size: formatBytes(bytes) }) : photos;
  };
  const section = choices.section;

  return (
    <GalleryMenu
      label={t("gallery.download.menu")}
      buttonClassName={className}
      buttonContent={
        <>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("gallery.download.menu")}
        </>
      }
      disabled={disabled}
      align="end"
      sheetTitle={t("gallery.download.menu")}
      note={t("gallery.download.note")}
    >
      {(close) => {
        const choose = (scope: DownloadScope) => {
          close();
          onDownload(scope);
        };
        return (
          <>
            <Choice
              label={t("gallery.download.allLabel")}
              detail={detail(choices.all.count, choices.all.bytes)}
              onClick={() => choose({ kind: "all" })}
            />
            {section && section.count > 0 && (
              <Choice
                label={t("gallery.download.sectionLabel", { name: section.name })}
                detail={detail(section.count, section.bytes)}
                onClick={() => choose({ kind: "section", section: section.key })}
              />
            )}
            {choices.favorites.count > 0 && (
              <Choice
                label={t("gallery.download.favoritesLabel")}
                detail={detail(choices.favorites.count, choices.favorites.bytes)}
                onClick={() => choose({ kind: "favorites" })}
              />
            )}
          </>
        );
      }}
    </GalleryMenu>
  );
}

function Choice({ label, detail, onClick }: { label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="gallery-menu__choice" onClick={onClick}>
      <span className="gallery-menu__choice-label">{label}</span>
      <span className="gallery-menu__choice-detail">{detail}</span>
    </button>
  );
}
