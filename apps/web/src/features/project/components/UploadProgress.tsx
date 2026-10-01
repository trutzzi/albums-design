import { useLanguage } from "@/shared/i18n/LanguageContext";
import type { UploadBatch } from "@/features/project/hooks/usePhotoUpload";

/** Blocks the page while a batch uploads — on any step, since "Add photos" works from all of them. */
export function UploadProgress({ batch, onCancel }: { batch: UploadBatch; onCancel: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="modal-overlay upload-overlay" role="presentation">
      <div className="modal upload-progress" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <h2 id="upload-title">{batch.cancelling ? t("project.upload.cancelling") : t("project.upload.title")}</h2>
        <p className="muted">
          {t("project.upload.progress", { done: batch.done, total: batch.total })}
          {batch.failed > 0 && ` · ${t("project.upload.failed", { count: batch.failed })}`}
        </p>
        <div
          className="upload-progress__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={batch.total}
          aria-valuenow={batch.done + batch.failed}
        >
          <div
            className="upload-progress__bar"
            style={{ width: `${Math.round(((batch.done + batch.failed) / batch.total) * 100)}%` }}
          />
        </div>
        <p className="muted">{t("project.upload.keepOpen")}</p>
        <div className="modal__actions">
          <button type="button" className="button" disabled={batch.cancelling} onClick={onCancel}>
            {batch.cancelling ? t("project.upload.cancelling") : t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
