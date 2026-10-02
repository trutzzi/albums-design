import { useMutation, useQueryClient } from "@tanstack/react-query";
import { retryFailedAnalyses } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";

/**
 * Tells the photographer that analysis gave up on some photos — they are left out of
 * scoring and the automatic album — and offers to try them again.
 */
export function FailedAnalysisNotice({ projectId, failedCount }: { projectId: string; failedCount: number }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => retryFailedAnalyses(projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["photos", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  if (failedCount === 0) return null;

  return (
    <div className="notice" role="status">
      <p>{t("project.analysisFailed.body", { count: failedCount })}</p>
      {retry.isError && <p className="error">{t("project.analysisFailed.error")}</p>}
      <button type="button" className="button button--small" disabled={retry.isPending} onClick={() => retry.mutate()}>
        {retry.isPending ? t("project.analysisFailed.retrying") : t("project.analysisFailed.retry")}
      </button>
    </div>
  );
}
