import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PhotoAnalysisDTO, PhotoDTO } from "@albumflow/contracts";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { TRAY_GAP, computeTrayGrid, rowRange, type TrayDensity } from "../lib/tray-grid";

export interface PhotoTrayProps {
  photos: PhotoDTO[];
  /** Selection order, so a photographer can see the sequence they are building. */
  picked: string[];
  locked: boolean;
  onPhotoClick: (photoId: string) => void;
  /** Score and category from photo intelligence, keyed by photo id — shown on hover. */
  analysisByPhoto: Map<string, PhotoAnalysisDTO>;
  /** 1-based rank by overall score among every analysed photo in the shoot. */
  rankByPhoto: Map<string, number>;
  /** How many photos were ranked, so the overlay can show "#3 of 42". */
  rankedCount: number;
  /** Every photo id already placed on some spread in this album. */
  usedPhotoIds: Set<string>;
  /** Photos a client chose in a submitted selection, flagged with a heart. */
  clientPickedIds?: Set<string>;
  density?: TrayDensity;
  /** Changes whenever the filters or sort change, which sends the tray back to the top of the list. */
  resetKey?: string;
}

/**
 * The photo library of the editor, built for shoots of thousands of photos: only
 * the rows that are on screen (plus a few either side) exist in the page, so a
 * 2,000-photo tray costs the same as a 20-photo one, and only the thumbnails you
 * can actually see are downloaded. Memoised and split out from the editor so picking
 * a photo does not re-render every spread.
 */
export const PhotoTray = memo(function PhotoTray({
  photos,
  picked,
  locked,
  onPhotoClick,
  analysisByPhoto,
  rankByPhoto,
  rankedCount,
  usedPhotoIds,
  clientPickedIds,
  density = "m",
  resetKey,
}: PhotoTrayProps) {
  const { t } = useLanguage();
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const handleDragStart = useCallback((event: React.DragEvent, photoId: string) => {
    event.dataTransfer.setData("text/photo-id", photoId);
  }, []);

  // The grid depends on the measured width, so it follows the sidebar being widened or the window resized.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const grid = computeTrayGrid(width, photos.length, density);
  const virtualizer = useVirtualizer({
    count: grid.rowCount,
    getScrollElement: () => scroller.current,
    estimateSize: () => grid.rowHeight,
    overscan: 4,
  });

  // Row height changes with the width and the density; tell the virtualizer to re-measure.
  useEffect(() => {
    virtualizer.measure();
  }, [grid.rowHeight, grid.columns, virtualizer]);

  // A new filter or sort is a new list: start at its top rather than wherever the old one was scrolled.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  return (
    <div className="tray" ref={scroller} data-testid="photo-tray">
      <div className="tray__canvas" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const { start, end } = rowRange(row.index, grid.columns, photos.length);
          return (
            <div
              key={row.key}
              className="tray__row"
              style={{
                height: grid.tile,
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
                gap: TRAY_GAP,
              }}
            >
              {photos.slice(start, end).map((photo) => {
                const pickIndex = picked.indexOf(photo.id);
                const analysis = analysisByPhoto.get(photo.id);
                const rank = rankByPhoto.get(photo.id);
                const used = usedPhotoIds.has(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    className={[
                      "tray__item",
                      pickIndex >= 0 ? "tray__item--picked" : "",
                      used ? "tray__item--used" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    draggable
                    onDragStart={(event) => handleDragStart(event, photo.id)}
                    disabled={locked}
                    title={photo.fileName}
                    onClick={() => onPhotoClick(photo.id)}
                  >
                    <img
                      src={photo.thumbnailUrl ?? photo.previewUrl ?? ""}
                      alt={photo.fileName}
                      loading="lazy"
                      decoding="async"
                      // The tile is a fixed square, so the browser reserves the box before the bytes arrive.
                      width={Math.round(grid.tile)}
                      height={Math.round(grid.tile)}
                    />
                    {analysis && (
                      <div className="tray__overlay">
                        <span className="tray__overlay-score">{analysis.overall}</span>
                        <span className="tray__overlay-category">{analysis.category.toLowerCase()}</span>
                        {rank !== undefined && (
                          <span className="tray__overlay-rank">
                            {t("album.photoTray.rankOf", { rank, count: rankedCount })}
                          </span>
                        )}
                      </div>
                    )}
                    {clientPickedIds?.has(photo.id) && (
                      <span className="tray__client-pick" title={t("album.photoTray.clientPicked")}>
                        ♥
                      </span>
                    )}
                    {used && (
                      <span className="tray__used-mark" title={t("album.photoTray.alreadyUsed")}>
                        ✓
                      </span>
                    )}
                    {pickIndex >= 0 && <span className="tray__badge">{pickIndex + 1}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});
