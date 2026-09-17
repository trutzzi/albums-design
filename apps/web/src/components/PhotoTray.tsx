import { memo, useCallback } from "react";
import type { PhotoDTO } from "@albumflow/contracts";

export interface PhotoTrayProps {
  photos: PhotoDTO[];
  /** Selection order, so a photographer can see the sequence they are building. */
  picked: string[];
  locked: boolean;
  onPhotoClick: (photoId: string) => void;
}

/**
 * Memoised and split out from the editor: picking a photo used to re-render every
 * spread on the page, and every spread carries images the browser then re-decodes.
 */
export const PhotoTray = memo(function PhotoTray({
  photos,
  picked,
  locked,
  onPhotoClick,
}: PhotoTrayProps) {
  const handleDragStart = useCallback((event: React.DragEvent, photoId: string) => {
    event.dataTransfer.setData("text/photo-id", photoId);
  }, []);

  return (
    <div className="tray">
      {photos.map((photo) => {
        const pickIndex = picked.indexOf(photo.id);
        return (
          <button
            key={photo.id}
            type="button"
            className={`tray__item ${pickIndex >= 0 ? "tray__item--picked" : ""}`}
            draggable
            onDragStart={(event) => handleDragStart(event, photo.id)}
            disabled={locked}
            onClick={() => onPhotoClick(photo.id)}
          >
            <img
              src={photo.thumbnailUrl ?? photo.previewUrl ?? ""}
              alt={photo.fileName}
              loading="lazy"
              decoding="async"
              // Declared so the browser reserves the box before the bytes arrive and
              // the tray does not reflow as a hundred thumbnails land.
              width={96}
              height={64}
            />
            {pickIndex >= 0 && <span className="tray__badge">{pickIndex + 1}</span>}
          </button>
        );
      })}
    </div>
  );
});
