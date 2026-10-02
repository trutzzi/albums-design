import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateAlbum, listProjectAlbums } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { tip } from "@/shared/lib/tip";
import type { AlbumSize } from "@/features/project/hooks/useAlbumSize";
import { AlbumSizeModal } from "./AlbumSizeModal";
import { LanguagePrompt } from "./LanguagePrompt";

/** Generating the album draft, and the shoot's albums. */
export function AlbumPanel({ projectId, size, analysed }: { projectId: string; size: AlbumSize; analysed: number }) {
  const { t, hasChosenLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const [targetSpreads, setTargetSpreads] = useState(10);
  const [sizeOpen, setSizeOpen] = useState(false);
  // Asked once, the first time anyone generates an album, if the studio has
  // never explicitly picked a language — see LanguagePrompt.
  const [askingLanguage, setAskingLanguage] = useState(false);

  const albums = useQuery({ queryKey: ["albums", projectId], queryFn: () => listProjectAlbums(projectId) });
  const generate = useMutation({
    mutationFn: () => generateAlbum(projectId, { targetSpreads, format: size.format }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["albums", projectId] }),
  });
  const start = () => {
    if (!hasChosenLanguage) {
      setAskingLanguage(true);
      return;
    }
    generate.mutate();
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{t("project.generate.title")}</h2>
        <div className="panel__actions">
          <label htmlFor="target-spreads" className="muted">
            {t("project.generate.targetSpreads")}
          </label>
          <input
            id="target-spreads"
            type="number"
            min={1}
            max={60}
            value={targetSpreads}
            onChange={(event) => setTargetSpreads(Number(event.target.value))}
          />
          <span className="muted">{t("project.generate.dimension")}</span>
          <button type="button" className="print-profile-chip" onClick={() => setSizeOpen(true)}>
            {t("dimension.chip", { width: size.selected.widthCm, height: size.selected.heightCm })}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={generate.isPending || analysed === 0}
            onClick={start}
            {...tip(analysed === 0 ? t("tip.generate.waiting") : t("tip.generate"))}
          >
            {generate.isPending ? t("project.generate.submitting") : t("project.generate.submit")}
          </button>
        </div>
      </div>
      {analysed === 0 && <p className="muted">{t("project.generate.waitingOnAnalysis")}</p>}
      {generate.isError && <p className="error">{(generate.error as Error).message}</p>}

      {albums.data && albums.data.length > 0 && (
        <ul className="album-list">
          {albums.data.map((album) => (
            <li key={album.id}>
              <div>
                <Link to={`/albums/${album.id}`} className="album-list__title">
                  {album.title}
                </Link>
                <p className="muted">
                  {album.spreadCount} spreads · {album.pageCount} pages · {album.photoCount} photos
                </p>
              </div>
              <span className={`chip chip--${album.status.toLowerCase()}`}>{album.status}</span>
            </li>
          ))}
        </ul>
      )}

      {sizeOpen && <AlbumSizeModal size={size} onClose={() => setSizeOpen(false)} />}
      {askingLanguage && (
        <LanguagePrompt
          onChoose={() => {
            setAskingLanguage(false);
            generate.mutate();
          }}
        />
      )}
    </section>
  );
}
