import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AlbumDTO } from "@albumflow/contracts";
import { listLayoutTemplates, listProjectPhotos } from "@/shared/api";
import { SpreadCanvas } from "@/shared/album/SpreadCanvas";
import { useLanguage } from "@/shared/i18n/LanguageContext";

/** Enough to see the album's flow at a glance; the editor shows the rest. */
const PREVIEW_SPREADS = 8;

/**
 * The first spreads of an album, small and read-only, as on the shoot board. Every query is
 * one the page or the editor already holds (photos, templates), so this adds no request.
 */
export function AlbumSpreadsPreview({ album }: { album: AlbumDTO }) {
  const { t } = useLanguage();
  const photos = useQuery({
    queryKey: ["photos", album.projectId],
    queryFn: () => listProjectPhotos(album.projectId),
  });
  const templates = useQuery({ queryKey: ["templates"], queryFn: listLayoutTemplates });
  const thumbnailByPhoto = useMemo(
    () => new Map((photos.data ?? []).map((photo) => [photo.id, photo.thumbnailUrl ?? photo.previewUrl])),
    [photos.data],
  );
  const templateById = useMemo(
    () => new Map((templates.data ?? []).map((template) => [template.id, template])),
    [templates.data],
  );
  if (album.spreads.length === 0) return null;
  // Spreads drawn before their layouts and photos arrive would show as empty frames.
  if (photos.isError || templates.isError) return <p className="muted">{t("project.album.previewError")}</p>;
  if (!photos.data || !templates.data) return null;
  const aspectRatio = (album.format.pageWidthMm * 2) / album.format.pageHeightMm;
  const more = album.spreads.length - PREVIEW_SPREADS;

  return (
    <Link to={`/albums/${album.id}`} className="album-preview" aria-label={t("project.next.openAlbum")}>
      {album.spreads.slice(0, PREVIEW_SPREADS).map((spread, spreadIndex) => (
        <figure key={spreadIndex} className="album-preview__spread">
          <SpreadCanvas
            spreadIndex={spreadIndex}
            template={templateById.get(spread.templateId)}
            placements={spread.placements}
            albumStyle={album.style ?? undefined}
            texts={spread.texts}
            previewUrlFor={(photoId) => thumbnailByPhoto.get(photoId)}
            aspectRatio={aspectRatio}
            pageWidthMm={album.format.pageWidthMm}
            pageHeightMm={album.format.pageHeightMm}
          />
          <figcaption>{t("review.spread", { number: spreadIndex + 1 })}</figcaption>
        </figure>
      ))}
      {more > 0 && <span className="album-preview__more">{t("project.album.more", { count: more })}</span>}
    </Link>
  );
}
