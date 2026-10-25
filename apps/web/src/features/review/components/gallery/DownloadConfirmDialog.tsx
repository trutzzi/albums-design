import { useRef, type ReactNode } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { useDialogFocus } from "@/shared/ui/useDialogFocus";
import { useDismiss } from "@/shared/ui/useDismiss";

/** "Download now?" before a ZIP starts: how long the photos stay, and how much is coming. */
export function DownloadConfirmDialog({
  title,
  children,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, confirmRef);
  useDismiss(true, onCancel);

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="download-confirm-title">{title}</h2>
        {children}
        <div className="modal__actions">
          <button type="button" className="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button ref={confirmRef} type="button" className="button button--primary" onClick={onConfirm}>
            {t("download.confirm.yes")}
          </button>
        </div>
      </div>
    </div>
  );
}
