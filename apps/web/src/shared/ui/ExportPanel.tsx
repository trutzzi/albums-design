import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteExport, getExportDownload, listExports, requestExport } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { madeAtOtherSize } from "@/shared/lib/print-size";

/**
 * Print-ready PDF exports: start one, follow it while it renders, download or delete it.
 * Shared by the editor's Export tab and the shoot's Delivery step (`title` names the album there).
 */
export function ExportPanel({
  albumId,
  albumFormat,
  hidden = false,
  title,
}: {
  albumId: string;
  /** The album's size now, to flag PDFs made before it changed. */
  albumFormat?: { pageWidthMm: number; pageHeightMm: number } | undefined;
  hidden?: boolean;
  title?: string;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const exports = useQuery({
    queryKey: ["exports", albumId],
    queryFn: () => listExports(albumId),
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === "QUEUED" || job.status === "RENDERING") ? 3000 : false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["exports", albumId] });
  const startExport = useMutation({ mutationFn: () => requestExport(albumId), onSuccess: refresh });
  const removeExport = useMutation({
    mutationFn: (exportJobId: string) => deleteExport(exportJobId),
    onSuccess: refresh,
  });

  return (
    <section className={`panel ${hidden ? "is-hidden" : ""}`}>
      <h2>{title ?? t("album.export.title")}</h2>
      <button type="button" className="button" disabled={startExport.isPending} onClick={() => startExport.mutate()}>
        {startExport.isPending ? t("album.export.queueing") : t("album.export.button")}
      </button>
      {startExport.isError && <p className="error">{(startExport.error as Error).message}</p>}
      {removeExport.isError && <p className="error">{(removeExport.error as Error).message}</p>}
      <ul className="export-list">
        {(exports.data ?? []).map((job) => {
          const inProgress = job.status === "QUEUED" || job.status === "RENDERING";
          const otherSize = job.status === "READY" && albumFormat ? madeAtOtherSize(job, albumFormat) : null;
          return (
            <li key={job.id}>
              <span className={`chip chip--${job.status.toLowerCase()}`}>{job.status}</span>
              {job.status === "READY" ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={async () => {
                    const { url } = await getExportDownload(job.id);
                    window.open(url, "_blank", "noopener");
                  }}
                >
                  {t("album.export.download", { size: Math.round((job.byteSize ?? 0) / 1024) })}
                </button>
              ) : (
                <span className="muted">{job.failureReason ?? `${job.printProfileId}`}</span>
              )}
              {otherSize && (
                <span className="export-list__stale">{t("album.export.otherSize", { size: otherSize })}</span>
              )}
              <button
                type="button"
                className="button button--small button--danger"
                title={inProgress ? t("album.export.inProgress.title") : t("album.export.delete.title")}
                disabled={inProgress || removeExport.isPending}
                onClick={() => {
                  if (window.confirm(t("album.export.delete.confirm"))) removeExport.mutate(job.id);
                }}
              >
                {removeExport.isPending && removeExport.variables === job.id
                  ? t("album.export.deleting")
                  : t("album.export.delete")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
