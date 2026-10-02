import { useMemo, useState } from "react";
import type { PhotoAnalysisDTO, PhotoDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { PhotoGallery } from "@/shared/ui/PhotoGallery";
import { PhotoLightbox } from "@/shared/ui/PhotoLightbox";

const PHOTO_FILTERS = ["all", "worthy", "picked", "processing", "failed"] as const;
type PhotoFilter = (typeof PHOTO_FILTERS)[number];
type PhotoSort = "name" | "score";

/** Still being analysed: no result yet, and analysis has not given up on it. */
const isProcessing = (photo: { analysis?: unknown; status: string }) => !photo.analysis && photo.status !== "FAILED";

/** How the photos are narrowed and ordered. Held by the page, so it survives a step change. */
export interface PhotoView {
  filter: PhotoFilter;
  sort: PhotoSort;
}
export const DEFAULT_PHOTO_VIEW: PhotoView = { filter: "all", sort: "name" };

/** A shoot's photos: filtered, sorted, laid out at their own proportions, opened full screen. */
export function PhotoBrowser({
  photos,
  analyses,
  clientPicked,
  view,
  onViewChange,
}: {
  photos: PhotoDTO[];
  analyses: PhotoAnalysisDTO[];
  /** Photos a client has sent as their picks, marked with a heart. */
  clientPicked: Set<string>;
  view: PhotoView;
  onViewChange: (view: PhotoView) => void;
}) {
  const { t } = useLanguage();
  const { sort } = view;
  const failedCount = photos.filter((photo) => photo.status === "FAILED").length;
  // The "failed" chip disappears once a retry succeeds; fall back to all photos rather
  // than leave an empty gallery with no chip selected.
  const filter: PhotoFilter = view.filter === "failed" && failedCount === 0 ? "all" : view.filter;
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const galleryPhotos = useMemo(() => {
    const byPhoto = new Map(analyses.map((analysis) => [analysis.photoId, analysis]));
    return photos.map((photo) => {
      const analysis = byPhoto.get(photo.id);
      return {
        ...photo,
        thumbnailUrl: photo.thumbnailUrl ?? photo.previewUrl,
        width: analysis?.width ?? null,
        height: analysis?.height ?? null,
        analysis,
      };
    });
  }, [photos, analyses]);

  const counts: Record<PhotoFilter, number> = useMemo(
    () => ({
      all: galleryPhotos.length,
      worthy: galleryPhotos.filter((photo) => photo.analysis?.albumWorthy).length,
      picked: galleryPhotos.filter((photo) => clientPicked.has(photo.id)).length,
      processing: galleryPhotos.filter(isProcessing).length,
      failed: failedCount,
    }),
    [galleryPhotos, clientPicked, failedCount],
  );

  const shown = useMemo(() => {
    const matching = galleryPhotos.filter((photo) =>
      filter === "worthy"
        ? photo.analysis?.albumWorthy
        : filter === "picked"
          ? clientPicked.has(photo.id)
          : filter === "processing"
            ? isProcessing(photo)
            : filter === "failed"
              ? photo.status === "FAILED"
              : true,
    );
    // The server already lists photos in file-name order.
    return sort === "score"
      ? [...matching].sort((a, b) => (b.analysis?.overall ?? -1) - (a.analysis?.overall ?? -1))
      : matching;
  }, [galleryPhotos, filter, sort, clientPicked]);

  const viewable = useMemo(
    () =>
      shown.flatMap((photo) =>
        photo.previewUrl ? [{ id: photo.id, fileName: photo.fileName, previewUrl: photo.previewUrl }] : [],
      ),
    [shown],
  );
  const lightboxIndex = lightboxId ? viewable.findIndex((photo) => photo.id === lightboxId) : -1;

  return (
    <section className="panel" data-tour="project-photos">
      <div className="panel__head">
        <h2>{t("project.photos.title")}</h2>
        {photos.length > 0 && (
          <div className="photo-toolbar">
            <div className="photo-toolbar__filters" role="group" aria-label={t("project.photos.filterLabel")}>
              {PHOTO_FILTERS.filter((option) => option !== "failed" || counts.failed > 0).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={filter === option}
                  className={`pick__filter ${filter === option ? "pick__filter--on" : ""}`}
                  onClick={() => onViewChange({ ...view, filter: option })}
                >
                  {t(`project.photos.filter.${option}`, { count: counts[option] })}
                </button>
              ))}
            </div>
            <label className="photo-toolbar__sort">
              {t("project.photos.sort")}{" "}
              <select
                value={sort}
                onChange={(event) => onViewChange({ ...view, sort: event.target.value as PhotoSort })}
              >
                <option value="name">{t("project.photos.sort.name")}</option>
                <option value="score">{t("project.photos.sort.score")}</option>
              </select>
            </label>
          </div>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="muted">{t("project.photos.empty")}</p>
      ) : shown.length === 0 ? (
        <p className="muted">{t("project.photos.filterEmpty")}</p>
      ) : (
        <PhotoGallery
          photos={shown}
          columnWidth={200}
          resetKey={`${filter}-${sort}`}
          onOpen={(photo) => setLightboxId(photo.id)}
          overlay={(photo) =>
            clientPicked.has(photo.id) ? (
              <span className="photo-card__pick" title={t("project.picks.badge")} aria-label={t("project.picks.badge")}>
                ♥
              </span>
            ) : null
          }
          placeholder={(photo) => <div className="gallery__placeholder">{t(`photo.status.${photo.status}`)}</div>}
          caption={(photo) => (
            <>
              <span className="photo-card__name">{photo.fileName}</span>
              {photo.analysis ? (
                <span className={`score ${photo.analysis.albumWorthy ? "score--good" : ""}`}>
                  {photo.analysis.overall} · {photo.analysis.category.toLowerCase()}
                </span>
              ) : (
                <span className="muted">{t(`photo.status.${photo.status}`)}</span>
              )}
            </>
          )}
          itemClassName={(photo) => (clientPicked.has(photo.id) ? "gallery__item--on" : "")}
          moreLabel={(remaining) => t("gallery.more", { count: remaining })}
        />
      )}
      {lightboxIndex >= 0 && (
        <PhotoLightbox
          photos={viewable}
          index={lightboxIndex}
          onIndexChange={(nextIndex) => setLightboxId(viewable[nextIndex]?.id ?? null)}
          onClose={() => setLightboxId(null)}
        />
      )}
    </section>
  );
}
