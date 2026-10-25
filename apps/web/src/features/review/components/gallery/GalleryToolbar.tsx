import { useCallback, useRef, useState } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import type { DownloadScope } from "@/shared/api";
import { useDismiss } from "@/features/review/hooks/useDismiss";
import { splitTabs, type GalleryFilter } from "@/features/review/lib/client-gallery";

/** How many chapters fit as tabs before the rest go behind "More". */
const VISIBLE_TABS = 5;

interface Props {
  sections: string[];
  filter: GalleryFilter;
  onFilter: (filter: GalleryFilter) => void;
  counts: { all: number; favorites: number; section: number };
  expiresOn: string;
  shareCopied: boolean;
  onShare: () => void;
  onDownload: (scope: DownloadScope) => void;
  canDownload: boolean;
  /** The name shown for a chapter: the studio's own, or the translated category. */
  sectionName: (section: string) => string;
}

/**
 * The bar that stays at the top while the client scrolls: the gallery's chapters, their
 * favourites, sharing, how long the photos last, and what to download.
 */
export function GalleryToolbar({
  sections,
  filter,
  onFilter,
  counts,
  expiresOn,
  shareCopied,
  onShare,
  onDownload,
  canDownload,
  sectionName,
}: Props) {
  const { t } = useLanguage();
  const active = filter.kind === "section" ? filter.section : undefined;
  const [tabs, overflow] = splitTabs(sections, VISIBLE_TABS, active);

  return (
    <div className="gallery-bar">
      <nav className="gallery-bar__tabs" aria-label={t("gallery.tabs.label")}>
        <Tab current={filter.kind === "all"} onClick={() => onFilter({ kind: "all" })}>
          {t("gallery.tabs.all")}
        </Tab>
        {tabs.map((section) => (
          <Tab key={section} current={active === section} onClick={() => onFilter({ kind: "section", section })}>
            {sectionName(section)}
          </Tab>
        ))}
        {overflow.length > 0 && (
          <Menu label={t("gallery.tabs.more")} buttonClassName="gallery-bar__tab">
            {(close) =>
              overflow.map((section) => (
                <button
                  key={section}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onFilter({ kind: "section", section });
                  }}
                >
                  {sectionName(section)}
                </button>
              ))
            }
          </Menu>
        )}
      </nav>

      <div className="gallery-bar__actions">
        <button
          type="button"
          className={`gallery-bar__action ${filter.kind === "favorites" ? "gallery-bar__action--on" : ""}`}
          aria-pressed={filter.kind === "favorites"}
          onClick={() => onFilter(filter.kind === "favorites" ? { kind: "all" } : { kind: "favorites" })}
        >
          <Icon path="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
          {t("gallery.favorites")}
          {counts.favorites > 0 && <span className="gallery-bar__count">{counts.favorites}</span>}
        </button>
        <button type="button" className="gallery-bar__action" onClick={onShare}>
          <Icon path="M14 5h5v5M19 5l-8 8M10 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4" />
          <span role="status">{shareCopied ? t("gallery.share.copied") : t("gallery.share")}</span>
        </button>
        <span className="gallery-bar__expires">{t("gallery.expires", { date: expiresOn })}</span>
        <Menu
          label={t("gallery.download.menu")}
          buttonClassName="button gallery-bar__download"
          disabled={!canDownload}
          align="end"
        >
          {(close) => {
            const choose = (scope: DownloadScope) => {
              close();
              onDownload(scope);
            };
            return (
              <>
                <button type="button" role="menuitem" onClick={() => choose({ kind: "all" })}>
                  {t("gallery.download.all", { count: counts.all })}
                </button>
                {active && counts.section > 0 && (
                  <button type="button" role="menuitem" onClick={() => choose({ kind: "section", section: active })}>
                    {t("gallery.download.section", { name: sectionName(active), count: counts.section })}
                  </button>
                )}
                {counts.favorites > 0 && (
                  <button type="button" role="menuitem" onClick={() => choose({ kind: "favorites" })}>
                    {t("gallery.download.favorites", { count: counts.favorites })}
                  </button>
                )}
              </>
            );
          }}
        </Menu>
      </div>
    </div>
  );
}

function Tab({ current, onClick, children }: { current: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`gallery-bar__tab ${current ? "gallery-bar__tab--on" : ""}`}
      aria-current={current ? "true" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Menu({
  label,
  buttonClassName,
  disabled,
  align = "start",
  children,
}: {
  label: string;
  buttonClassName: string;
  disabled?: boolean;
  align?: "start" | "end";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  return (
    <div className="gallery-menu" ref={ref}>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <div className={`gallery-menu__list gallery-menu__list--${align}`} role="menu">
          {children(close)}
        </div>
      )}
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
