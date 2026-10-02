import { useEffect } from "react";
import type { AlbumIssue } from "@/features/album-editor/lib/album-check";
import { DPI_ERROR, DPI_WARNING } from "@/features/album-editor/lib/album-check";
import { useLanguage } from "@/shared/i18n/LanguageContext";

/**
 * The pre-flight list: everything to look at before the album goes to the client or the
 * lab, worst first. Each line jumps to the photo it is about.
 */
export function AlbumCheckPanel({
  issues,
  thumbnailUrlFor,
  onJump,
  onShowUnused,
  onClose,
}: {
  issues: AlbumIssue[];
  thumbnailUrlFor: (photoId: string) => string | null | undefined;
  onJump: (spreadIndex: number, slotId?: string) => void;
  onShowUnused: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const describe = (issue: AlbumIssue): string => {
    switch (issue.kind) {
      case "lowResolution":
        return t(issue.severity === "error" ? "check.lowResolution.error" : "check.lowResolution.warning", {
          dpi: issue.dpi,
          min: issue.severity === "error" ? DPI_ERROR : DPI_WARNING,
        });
      case "emptySlot":
        return t("check.emptySlot");
      case "usedTwice":
        return t("check.usedTwice", { other: issue.otherSpreadIndex + 1 });
      case "nearDuplicate":
        return t("check.nearDuplicate", { other: issue.otherSpreadIndex + 1 });
      case "faceOnFold":
        return t("check.faceOnFold");
      case "unusedBest":
        return t("check.unusedBest", { count: issue.photoIds.length });
    }
  };

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal album-check"
        role="dialog"
        aria-modal="true"
        aria-labelledby="album-check-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="album-check-title">{t("check.title")}</h2>
        {issues.length === 0 ? (
          <p className="notice notice--good">{t("check.allGood")}</p>
        ) : (
          <p className="muted">{t("check.summary", { errors, warnings })}</p>
        )}
        <ul className="album-check__list">
          {issues.map((issue, index) => {
            const photoId = "photoId" in issue ? issue.photoId : "photoIds" in issue ? issue.photoIds[0] : undefined;
            const thumb = photoId ? thumbnailUrlFor(photoId) : null;
            return (
              <li key={index} className={`album-check__item album-check__item--${issue.severity}`}>
                {thumb ? (
                  <img src={thumb} alt="" className="album-check__thumb" />
                ) : (
                  <span className="album-check__thumb" />
                )}
                <span className="album-check__text">
                  {"spreadIndex" in issue && (
                    <strong>{t("check.onSpread", { number: issue.spreadIndex + 1 })} · </strong>
                  )}
                  {describe(issue)}
                </span>
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => {
                    if (issue.kind === "unusedBest") onShowUnused();
                    else onJump(issue.spreadIndex, "slotId" in issue ? issue.slotId : undefined);
                    onClose();
                  }}
                >
                  {issue.kind === "unusedBest" ? t("check.showPhotos") : t("check.goTo")}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="modal__actions">
          <button type="button" className="button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
