import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface GalleryPhoto {
  id: string;
  fileName: string;
  thumbnailUrl: string | null;
  /** Upright pixel size from the photo's analysis; until it is known, the loaded image's own size is used. */
  width?: number | null;
  height?: number | null;
}

interface Props<Photo extends GalleryPhoto> {
  photos: Photo[];
  /** Opens the full-screen viewer; `index` is the photo's position in `photos`. */
  onOpen?: (photo: Photo, index: number) => void;
  /** Drawn over the photo — the pick heart, a badge. */
  overlay?: (photo: Photo) => ReactNode;
  caption?: (photo: Photo) => ReactNode;
  /** Shown in place of a photo that has no display copy yet. */
  placeholder?: (photo: Photo) => ReactNode;
  itemClassName?: (photo: Photo) => string;
  /** About how wide a column should be; as many fit as the width allows. */
  columnWidth?: number;
  /** Photos are laid out in batches as the viewer scrolls, so thousands never load at once. */
  batchSize?: number;
  /** Label of the button that shows the next batch, given how many are left. */
  moreLabel: (remaining: number) => string;
  /** Change it (a new filter, a new sort) to start again from the first batch. */
  resetKey?: string;
}

const GAP = 10;
/** A 3:2 landscape — the commonest camera shape — until a photo's real size is known. */
const FALLBACK_RATIO = 2 / 3;
const CAPTION_HEIGHT = 30;

/**
 * Photos at their own proportions — portraits tall, landscapes wide — in masonry columns.
 * Each photo goes to whichever column is shortest so far, so the shoot still reads left to
 * right, row by row, instead of down one column and then the next. Every frame takes its
 * size from the photo's known dimensions before the image arrives, so nothing jumps while
 * the page loads.
 */
export function PhotoGallery<Photo extends GalleryPhoto>({
  photos,
  onOpen,
  overlay,
  caption,
  placeholder,
  itemClassName,
  columnWidth = 240,
  batchSize = 120,
  moreLabel,
  resetKey,
}: Props<Photo>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(batchSize);
  /** Height ÷ width, read from the loaded image, for photos the server had no size for. */
  const [measured, setMeasured] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setShown(batchSize), [resetKey, batchSize]);

  // Scrolling near the end lays out the next batch; the button below does the same by hand.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || shown >= photos.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown((count) => count + batchSize);
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [shown, photos.length, batchSize]);

  const ratioOf = (photo: Photo) =>
    photo.width && photo.height ? photo.height / photo.width : (measured[photo.id] ?? FALLBACK_RATIO);

  const fitting = Math.floor((width + GAP) / (columnWidth + GAP));
  // Two across even on a phone: one column of full-width photos is a slog to scroll.
  const columnCount = width === 0 ? 0 : Math.min(6, Math.max(2, fitting));
  const columnPixels = columnCount ? (width - GAP * (columnCount - 1)) / columnCount : 0;
  const columns: { photo: Photo; index: number }[][] = Array.from({ length: columnCount }, () => []);
  const heights = new Array<number>(columnCount).fill(0);
  photos.slice(0, shown).forEach((photo, index) => {
    let target = 0;
    // The leftmost of near-equal columns wins, which keeps the reading order across.
    for (let column = 1; column < columnCount; column++) {
      if (heights[column]! < heights[target]! - 1) target = column;
    }
    columns[target]?.push({ photo, index });
    heights[target]! += columnPixels * ratioOf(photo) + GAP + (caption ? CAPTION_HEIGHT : 0);
  });

  const remember = (photo: Photo, image: HTMLImageElement) => {
    if ((photo.width && photo.height) || !image.naturalWidth) return;
    const ratio = image.naturalHeight / image.naturalWidth;
    if (Math.abs((measured[photo.id] ?? FALLBACK_RATIO) - ratio) > 0.01) {
      setMeasured((current) => ({ ...current, [photo.id]: ratio }));
    }
  };

  return (
    <div ref={containerRef} className="gallery">
      <div className="gallery__columns" style={{ gridTemplateColumns: `repeat(${columnCount || 1}, minmax(0, 1fr))` }}>
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="gallery__column">
            {column.map(({ photo, index }) => {
              const image = photo.thumbnailUrl ? (
                <img
                  src={photo.thumbnailUrl}
                  alt={photo.fileName}
                  loading="lazy"
                  decoding="async"
                  onLoad={(event) => remember(photo, event.currentTarget)}
                />
              ) : (
                (placeholder?.(photo) ?? null)
              );
              return (
                <figure key={photo.id} className={`gallery__item ${itemClassName?.(photo) ?? ""}`}>
                  <div className="gallery__frame" style={{ aspectRatio: String(1 / ratioOf(photo)) }}>
                    {onOpen && photo.thumbnailUrl ? (
                      <button
                        type="button"
                        className="gallery__open"
                        aria-label={photo.fileName}
                        onClick={() => onOpen(photo, index)}
                      >
                        {image}
                      </button>
                    ) : (
                      image
                    )}
                    {overlay?.(photo)}
                  </div>
                  {caption && <figcaption className="gallery__caption">{caption(photo)}</figcaption>}
                </figure>
              );
            })}
          </div>
        ))}
      </div>
      {shown < photos.length && (
        <div ref={sentinelRef} className="gallery__more">
          <button type="button" className="button" onClick={() => setShown((count) => count + batchSize)}>
            {moreLabel(photos.length - shown)}
          </button>
        </div>
      )}
    </div>
  );
}
