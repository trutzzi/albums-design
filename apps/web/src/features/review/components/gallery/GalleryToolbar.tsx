import type { ReactNode } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { localeOf } from "@/shared/i18n/locale";
import { splitTabs, type GalleryFilter } from "@/features/review/lib/client-gallery";
import { GalleryMenu } from "./GalleryMenu";

/** How many chapters fit as tabs before the rest go behind "More". */
const VISIBLE_TABS = 5;

interface Props {
  sections: string[];
  filter: GalleryFilter;
  onFilter: (filter: GalleryFilter) => void;
  counts: { all: number; favorites: number; bySection: ReadonlyMap<string, number> };
  expiresOn: string;
  shareCopied: boolean;
  onShare: () => void;
  /** The download menu. On a phone it lives in the floating bar instead, so this one is hidden there. */
  download: ReactNode;
  /** The name shown for a chapter: the studio's own, or the translated category. */
  sectionName: (section: string) => string;
}

/**
 * The bar that stays at the top while the client scrolls: the gallery's chapters with how
 * many photos each holds, their favourites, sharing, how long the photos last, and what to
 * download. On a phone the chapters scroll sideways as chips.
 */
export function GalleryToolbar({
  sections,
  filter,
  onFilter,
  counts,
  expiresOn,
  shareCopied,
  onShare,
  download,
  sectionName,
}: Props) {
  const { t, language } = useLanguage();
  const locale = localeOf(language);
  const active = filter.kind === "section" ? filter.section : undefined;
  const [tabs, overflow] = splitTabs(sections, VISIBLE_TABS, active);
  const favoritesOn = filter.kind === "favorites";

  return (
    <div className="gallery-bar">
      <nav className="gallery-bar__tabs" aria-label={t("gallery.tabs.label")}>
        <Tab
          current={filter.kind === "all"}
          count={counts.all.toLocaleString(locale)}
          onClick={() => onFilter({ kind: "all" })}
        >
          {t("gallery.tabs.all")}
        </Tab>
        {tabs.map((section) => (
          <Tab
            key={section}
            current={active === section}
            count={counts.bySection.get(section)?.toLocaleString(locale)}
            onClick={() => onFilter({ kind: "section", section })}
          >
            {sectionName(section)}
          </Tab>
        ))}
        {overflow.length > 0 && (
          <GalleryMenu label={t("gallery.tabs.more")} buttonClassName="gallery-bar__tab">
            {(close) =>
              overflow.map((section) => (
                <button
                  key={section}
                  type="button"
                  role="menuitem"
                  className="gallery-menu__choice"
                  onClick={() => {
                    close();
                    onFilter({ kind: "section", section });
                  }}
                >
                  <span className="gallery-menu__choice-label">{sectionName(section)}</span>
                  <span className="gallery-menu__choice-detail">
                    {(counts.bySection.get(section) ?? 0).toLocaleString(locale)}
                  </span>
                </button>
              ))
            }
          </GalleryMenu>
        )}
      </nav>

      <div className="gallery-bar__actions">
        <button
          type="button"
          className={`gallery-bar__pill ${favoritesOn ? "gallery-bar__pill--on" : ""}`}
          aria-pressed={favoritesOn}
          onClick={() => onFilter(favoritesOn ? { kind: "all" } : { kind: "favorites" })}
        >
          <Icon path="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" filled />
          <span className="gallery-bar__pill-label">{t("gallery.favorites")}</span>
          {counts.favorites > 0 && <span className="gallery-bar__count">{counts.favorites}</span>}
        </button>
        <button type="button" className="gallery-bar__pill" onClick={onShare}>
          <Icon path="M12 4v11M8 8l4-4 4 4M5 13v6h14v-6" />
          <span className="gallery-bar__pill-label">
            {shareCopied ? t("gallery.share.copied") : t("gallery.share")}
          </span>
        </button>
        {/* Outside the button, so its label is not itself a live region. */}
        <span className="visually-hidden" role="status">
          {shareCopied ? t("gallery.share.copied") : ""}
        </span>
        <span className="gallery-bar__expires">
          <Icon path="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" small />
          {t("gallery.expires", { date: expiresOn })}
        </span>
        <div className="gallery-bar__download">{download}</div>
      </div>
    </div>
  );
}

function Tab({
  current,
  count,
  onClick,
  children,
}: {
  current: boolean;
  count?: string | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`gallery-bar__tab ${current ? "gallery-bar__tab--on" : ""}`}
      aria-current={current ? "true" : undefined}
      onClick={onClick}
    >
      {children}
      {count && <span className="gallery-bar__tab-count">{count}</span>}
    </button>
  );
}

function Icon({ path, filled = false, small = false }: { path: string; filled?: boolean; small?: boolean }) {
  const size = small ? 14 : 18;
  return (
    <svg
      className={filled ? "gallery-bar__icon--heart" : undefined}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
