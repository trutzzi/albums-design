import { memo, useEffect, useRef, useState } from "react";
import { spacedSlotRect, type AlbumDTO, type AlbumStyleDTO, type LayoutTemplateDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";

type Spread = AlbumDTO["spreads"][number];

export interface PageStripProps {
  spreads: Spread[];
  templateById: ReadonlyMap<string, LayoutTemplateDTO>;
  thumbnailUrlFor: (photoId: string) => string | null | undefined;
  albumStyle: AlbumStyleDTO;
  /** Width ÷ height of one spread. */
  aspectRatio: number;
  currentIndex: number;
  locked: boolean;
  openCommentsBySpread: ReadonlyMap<number, number>;
  issuesBySpread: ReadonlyMap<number, { errors: number; warnings: number }>;
  /** Chapter keys for the spreads that open one (see chapters.ts). */
  chapters: (string | undefined)[];
  onJump: (spreadIndex: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** A tray photo dropped on a thumbnail joins that spread. */
  onDropPhoto: (spreadIndex: number, photoId: string) => void;
}

/**
 * Every spread as a small thumbnail, pinned to the bottom of the editor: click to jump,
 * drag one onto another to reorder, drop a tray photo onto one to add it there. The dots
 * say where the album check found something and where the client left notes.
 */
export const PageStrip = memo(function PageStrip({
  spreads,
  templateById,
  thumbnailUrlFor,
  albumStyle,
  aspectRatio,
  currentIndex,
  locked,
  openCommentsBySpread,
  issuesBySpread,
  chapters,
  onJump,
  onReorder,
  onDropPhoto,
}: PageStripProps) {
  const { t } = useLanguage();
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  // Keeps the spread being worked on in view as the page scrolls.
  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-strip-index="${currentIndex}"]`);
    item?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [currentIndex]);

  return (
    <nav
      className={`page-strip ${collapsed ? "page-strip--collapsed" : ""}`}
      aria-label={t("strip.label")}
      data-tour="editor-strip"
    >
      <button
        type="button"
        className="page-strip__toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
        title={collapsed ? t("strip.show") : t("strip.hide")}
      >
        {collapsed ? "▲" : "▼"} {t("strip.title", { count: spreads.length })}
      </button>
      {!collapsed && (
        <ol className="page-strip__list" ref={listRef}>
          {spreads.map((spread, index) => {
            const template = templateById.get(spread.templateId);
            const issues = issuesBySpread.get(index);
            const comments = openCommentsBySpread.get(index) ?? 0;
            const chapter = chapters[index];
            return (
              <li
                key={index}
                data-strip-index={index}
                className={[
                  "page-strip__item",
                  index === currentIndex ? "page-strip__item--current" : "",
                  dropTarget === index ? "page-strip__item--drop" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                draggable={!locked}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/strip-index", String(index));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (locked) return;
                  event.preventDefault();
                  setDropTarget(index);
                }}
                onDragLeave={() => setDropTarget((value) => (value === index ? null : value))}
                onDrop={(event) => {
                  event.preventDefault();
                  setDropTarget(null);
                  const from = event.dataTransfer.getData("text/strip-index");
                  if (from !== "") {
                    if (Number(from) !== index) onReorder(Number(from), index);
                    return;
                  }
                  const photoId = event.dataTransfer.getData("text/photo-id");
                  if (photoId) onDropPhoto(index, photoId);
                }}
              >
                {chapter && <span className="page-strip__chapter">{t(`chapter.${chapter}`)}</span>}
                <button
                  type="button"
                  className="page-strip__thumb"
                  style={{ aspectRatio: String(aspectRatio), background: albumStyle.background }}
                  aria-label={t("strip.jump", { number: index + 1 })}
                  aria-current={index === currentIndex ? "true" : undefined}
                  onClick={() => onJump(index)}
                >
                  {template?.slots.map((slot) => {
                    const placement = spread.placements.find((candidate) => candidate.slotId === slot.id);
                    const rect = placement?.frame ?? spacedSlotRect(slot, template, albumStyle.spacing);
                    const url = placement?.photoId ? thumbnailUrlFor(placement.photoId) : null;
                    return (
                      <span
                        key={slot.id}
                        className={`page-strip__slot ${url ? "" : "page-strip__slot--empty"} ${
                          placement?.treatment === "BLACK_WHITE" ? "is-monochrome" : ""
                        }`}
                        style={{
                          left: `${rect.x * 100}%`,
                          top: `${rect.y * 100}%`,
                          width: `${rect.width * 100}%`,
                          height: `${rect.height * 100}%`,
                          backgroundImage: url ? `url("${url}")` : undefined,
                        }}
                      />
                    );
                  })}
                </button>
                <span className="page-strip__meta">
                  <span className="page-strip__number">{index + 1}</span>
                  {spread.locked && <span aria-label={t("spread.lock.badge")}>🔒</span>}
                  {issues && issues.errors > 0 && (
                    <span
                      className="page-strip__dot page-strip__dot--error"
                      title={t("strip.issues", { count: issues.errors + issues.warnings })}
                    />
                  )}
                  {issues && issues.errors === 0 && issues.warnings > 0 && (
                    <span
                      className="page-strip__dot page-strip__dot--warning"
                      title={t("strip.issues", { count: issues.warnings })}
                    />
                  )}
                  {comments > 0 && (
                    <span className="page-strip__comments" title={t("strip.comments", { count: comments })}>
                      {comments}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
});
