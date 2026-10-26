import { useQuery } from "@tanstack/react-query";
import { listProjectAlbums } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ExportPanel } from "@/shared/ui/ExportPanel";

/**
 * The Delivery step's print-ready PDF, as on the shoot board: the same exports as the
 * editor's Export tab, one card per album, so delivering never needs a detour to the editor.
 */
export function PrintPdfPanel({ projectId }: { projectId: string }) {
  const { t } = useLanguage();
  const albums = useQuery({ queryKey: ["albums", projectId], queryFn: () => listProjectAlbums(projectId) });
  if (!albums.data) return null;
  if (albums.data.length === 0) {
    return (
      <section className="panel">
        <h2>{t("project.pdf.title")}</h2>
        <p className="muted">{t("project.pdf.noAlbum")}</p>
      </section>
    );
  }
  return (
    <>
      {albums.data.map((album) => (
        <ExportPanel
          key={album.id}
          albumId={album.id}
          title={albums.data.length > 1 ? `${t("project.pdf.title")} · ${album.title}` : t("project.pdf.title")}
        />
      ))}
    </>
  );
}
