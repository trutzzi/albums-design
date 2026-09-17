import { memo, useCallback } from "react";
import type { PhotoAnalysisDTO, PhotoDTO } from "@albumflow/contracts";

export interface PhotoTrayProps {
  photos: PhotoDTO[];
  /** Selection order, so a photographer can see the sequence they are building. */
  picked: string[];
  locked: boolean;
  onPhotoClick: (photoId: string) => void;
  /** Score and category from photo intelligence, keyed by photo id — shown on hover. */
  analysisByPhoto: Map<string, PhotoAnalysisDTO>;
  /** Every photo id already placed on some spread in this album. */
  usedPhotoIds: Set<string>;
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
  analysisByPhoto,
  usedPhotoIds,
}: PhotoTrayProps) {
  const handleDragStart = useCallback((event: React.DragEvent, photoId: string) => {
    event.dataTransfer.setData("text/photo-id", photoId);
  }, []);

  return (
    <div className="tray">
      {photos.map((photo) => {
        const pickIndex = picked.indexOf(photo.id);
        const analysis = analysisByPhoto.get(photo.id);
        const used = usedPhotoIds.has(photo.id);
        const titleParts = [photo.fileName];
        if (analysis) titleParts.push(`Score ${analysis.overall} · ${analysis.category.toLowerCase()}`);
        if (used) titleParts.push("Already used in this album");
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
            title={titleParts.join(" — ")}
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
            {used && (
              <span className="tray__used-mark" title="Already used in this album">
                ✓
              </span>
            )}
            {pickIndex >= 0 && <span className="tray__badge">{pickIndex + 1}</span>}
          </button>
        );
      })}
    </div>
  );
});
