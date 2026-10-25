import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GalleryOverride } from "@albumflow/contracts";
import {
  chooseDownloadCover,
  listProjectPhotos,
  restyleDownloadGallery,
  type DownloadSessionSummary,
} from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { PhotoGallery } from "@/shared/ui/PhotoGallery";
import { GalleryLookFields } from "@/shared/ui/GalleryLookFields";

/**
 * One delivery gallery's own touches: the photo at the top (or the automatic one, the
 * best-rated couple shot) and — on Studio Pro — a look that differs from the studio's
 * style for this shoot only.
 */
export function GalleryCustomiseModal({
  projectId,
  session,
  canStyle,
  onClose,
}: {
  projectId: string;
  session: DownloadSessionSummary;
  /** The plan lets a gallery have its own look (Studio Pro). */
  canStyle: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [look, setLook] = useState<GalleryOverride>(session.lookOverride ?? {});
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["download-sessions", projectId] });
  // Same key as the shoot page, so the photos are usually already loaded.
  const photos = useQuery({ queryKey: ["photos", projectId], queryFn: () => listProjectPhotos(projectId) });
  const choose = useMutation({
    mutationFn: (photoId: string | null) => chooseDownloadCover(projectId, session.id, photoId),
    onSuccess: refresh,
  });
  const restyle = useMutation({
    mutationFn: (override: GalleryOverride | null) => restyleDownloadGallery(projectId, session.id, override),
    onSuccess: async (updated) => {
      setLook(updated.lookOverride ?? {});
      await refresh();
    },
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const choosable = (photos.data ?? []).filter((photo) => photo.thumbnailUrl);
  const current = choose.data?.coverPhotoId ?? session.coverPhotoId ?? null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-customise-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="gallery-customise-title">{t("project.delivery.customise.title", { name: session.clientName })}</h2>

        <h3 className="branding__subtitle">{t("project.delivery.cover.title")}</h3>
        <p className="muted">
          {t("project.delivery.cover.intro")}{" "}
          <strong>{current ? t("project.delivery.cover.custom") : t("project.delivery.cover.automatic")}</strong>
        </p>
        {photos.isLoading && <p className="muted">{t("project.delivery.cover.loading")}</p>}
        {photos.isError && <p className="error">{(photos.error as Error).message}</p>}
        {photos.isSuccess && choosable.length === 0 && <p className="muted">{t("project.delivery.cover.empty")}</p>}
        {choosable.length > 0 && (
          <div className="cover-picker__grid">
            <PhotoGallery
              photos={choosable}
              columnWidth={150}
              onOpen={(photo) => choose.mutate(photo.id)}
              itemClassName={(photo) => (photo.id === current ? "cover-picker__item--on" : "")}
              moreLabel={(remaining) => t("gallery.more", { count: remaining })}
            />
          </div>
        )}
        <button
          type="button"
          className="button button--small"
          disabled={choose.isPending || current === null}
          onClick={() => choose.mutate(null)}
        >
          {t("project.delivery.cover.auto")}
        </button>
        {choose.isError && <p className="error">{(choose.error as Error).message}</p>}

        {canStyle && (
          <>
            <h3 className="branding__subtitle">{t("project.delivery.look.title")}</h3>
            <p className="muted">{t("project.delivery.look.intro")}</p>
            <GalleryLookFields idPrefix={`look-${session.id}`} value={look} onChange={setLook} inherit />
            <div className="panel__actions">
              <button
                type="button"
                className="button button--primary"
                disabled={restyle.isPending}
                onClick={() => restyle.mutate(Object.keys(look).length > 0 ? look : null)}
              >
                {t("project.delivery.look.save")}
              </button>
              <button
                type="button"
                className="button"
                disabled={restyle.isPending || !session.lookOverride}
                onClick={() => restyle.mutate(null)}
              >
                {t("project.delivery.look.reset")}
              </button>
            </div>
            {restyle.isSuccess && !restyle.isPending && (
              <p className="notice notice--good">{t("project.delivery.look.saved")}</p>
            )}
            {restyle.isError && <p className="error">{(restyle.error as Error).message}</p>}
          </>
        )}

        <div className="modal__actions">
          <button type="button" className="button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
