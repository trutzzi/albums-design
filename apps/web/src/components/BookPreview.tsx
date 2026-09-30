import { useCallback, useEffect, useRef, useState } from "react";
import type { AlbumCoverDTO, AlbumDTO, AlbumStyleDTO, LayoutTemplateDTO, PhotoFocus, TextBlockDTO } from "@albumflow/contracts";
import { SpreadCanvas, type SpreadPlacement } from "./SpreadCanvas";
import { CoverPreview } from "./CoverEditor";
import { useLanguage } from "../lib/i18n/LanguageContext";

/**
 * The album as the client will hold it: one spread at a time, full screen, turned like a
 * book with the arrow keys, the buttons or a swipe. Nothing here can be edited — it is
 * for showing, in person or on a video call.
 */
export function BookPreview({
  album,
  templateById,
  previewUrlFor,
  focusFor,
  startAt = 0,
  watermark = false,
  onClose,
}: {
  /** The editor's album or the client proof's — both carry what a page needs. */
  album: Pick<AlbumDTO, "title" | "format"> & {
    style: AlbumStyleDTO;
    cover: AlbumCoverDTO | null;
    spreads: { templateId: string; placements: SpreadPlacement[]; texts?: TextBlockDTO[] | undefined }[];
  };
  templateById: ReadonlyMap<string, LayoutTemplateDTO>;
  previewUrlFor: (photoId: string) => string | null | undefined;
  focusFor: (photoId: string) => PhotoFocus | null | undefined;
  /** The spread to open on (the cover, when there is one, comes before spread 0). */
  startAt?: number;
  /** The client proof's watermark, drawn over every page exactly as on the review page. */
  watermark?: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const hasCover = Boolean(album.cover);
  const pageCount = album.spreads.length + (hasCover ? 1 : 0);
  const [page, setPage] = useState(Math.min(pageCount - 1, startAt + (hasCover ? 1 : 0)));
  const [turn, setTurn] = useState<"forward" | "back">("forward");
  const swipeFrom = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      setTurn(delta > 0 ? "forward" : "back");
      setPage((current) => Math.min(pageCount - 1, Math.max(0, current + delta)));
    },
    [pageCount],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("is-previewing");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("is-previewing");
    };
  }, [go, onClose]);

  const onCover = hasCover && page === 0;
  const spreadIndex = page - (hasCover ? 1 : 0);
  const spread = album.spreads[spreadIndex];
  const pageAspect = album.format.pageWidthMm / album.format.pageHeightMm;

  return (
    <div
      className="book-preview"
      role="dialog"
      aria-modal="true"
      aria-label={t("preview.label", { title: album.title })}
      onPointerDown={(event) => {
        swipeFrom.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (swipeFrom.current === null) return;
        const distance = event.clientX - swipeFrom.current;
        swipeFrom.current = null;
        if (Math.abs(distance) > 60) go(distance < 0 ? 1 : -1);
      }}
    >
      <header className="book-preview__bar">
        <span className="book-preview__title">{album.title}</span>
        <span className="book-preview__count">
          {onCover ? t("preview.cover") : t("preview.spread", { number: spreadIndex + 1, total: album.spreads.length })}
        </span>
        <button type="button" className="book-preview__close" onClick={onClose} aria-label={t("common.close")}>
          ✕
        </button>
      </header>

      <div className="book-preview__stage">
        <button
          type="button"
          className="book-preview__nav book-preview__nav--back"
          disabled={page === 0}
          onClick={() => go(-1)}
          aria-label={t("preview.previous")}
        >
          ‹
        </button>
        <div
          key={page}
          className={`book-preview__page book-preview__page--${turn} ${onCover ? "book-preview__page--cover" : ""} ${
            watermark ? "proof-watermark" : ""
          }`}
        >
          {onCover && album.cover ? (
            <CoverPreview
              cover={album.cover}
              albumStyle={album.style}
              aspectRatio={pageAspect}
              previewUrl={album.cover.photoId ? previewUrlFor(album.cover.photoId) : null}
              focus={album.cover.photoId ? focusFor(album.cover.photoId) : null}
            />
          ) : spread ? (
            <SpreadCanvas
              spreadIndex={spreadIndex}
              template={templateById.get(spread.templateId)}
              placements={spread.placements}
              previewUrlFor={previewUrlFor}
              focusFor={focusFor}
              aspectRatio={pageAspect * 2}
              pageWidthMm={album.format.pageWidthMm}
              pageHeightMm={album.format.pageHeightMm}
              albumStyle={album.style}
              texts={spread.texts}
            />
          ) : null}
        </div>
        <button
          type="button"
          className="book-preview__nav book-preview__nav--forward"
          disabled={page === pageCount - 1}
          onClick={() => go(1)}
          aria-label={t("preview.next")}
        >
          ›
        </button>
      </div>
      <p className="book-preview__hint">{t("preview.hint")}</p>
    </div>
  );
}
