import { useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAiStatus } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { PlanUpsell } from "@/shared/ui/PlanUpsell";
import type { PhotoUpload } from "@/features/project/hooks/usePhotoUpload";

/**
 * Adding photos to a shoot: the AI-analysis switch (behind a consent dialog), the drop
 * zone — a big box while the shoot is empty, a slim bar after — and what failed.
 */
export function PhotoUploader({
  upload,
  inputRef,
  useAi,
  onUseAiChange,
  photoCount,
  photoLimit,
}: {
  upload: PhotoUpload;
  /** The page's file input, so "Add photos" in the next-step hint opens the same picker. */
  inputRef: RefObject<HTMLInputElement | null>;
  useAi: boolean;
  onUseAiChange: (useAi: boolean) => void;
  photoCount: number;
  photoLimit: number | null;
}) {
  const { t } = useLanguage();
  const [isDragging, setDragging] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  // Polled independently of everything else on this page — a downed local AI
  // server never blocks uploads or generation (photo analysis quietly falls
  // back to the heuristic classifier), this is purely informational.
  const aiStatus = useQuery({ queryKey: ["ai-status"], queryFn: getAiStatus, refetchInterval: 20000, retry: false });

  return (
    <>
      <div className="ai-toggle-row">
        <label className="ruler-toggle">
          <input
            type="checkbox"
            className="ruler-toggle__input"
            checked={useAi}
            disabled={!aiStatus.data?.available}
            onChange={(event) => {
              // Off by default: AI analysis costs real time (and, with a paid provider,
              // real money) that the free heuristic doesn't — turning it on asks first.
              if (event.target.checked) setConsentOpen(true);
              else onUseAiChange(false);
            }}
          />
          <span className="ruler-toggle__track" aria-hidden="true">
            <span className="ruler-toggle__thumb" />
          </span>
          {t("project.upload.useAi")}
        </label>
        <span
          className={`chip ai-status-chip chip--${aiStatus.data?.available ? "active" : "queued"}`}
          title={aiStatus.data?.available ? t("ai.status.online.title") : t("project.upload.useAi.unavailable")}
        >
          {aiStatus.data?.available ? t("ai.status.online") : t("ai.status.offline")}
        </span>
      </div>

      <section
        data-tour="project-upload"
        role="button"
        tabIndex={0}
        className={`dropzone ${photoCount > 0 ? "dropzone--compact" : ""} ${isDragging ? "dropzone--active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          upload.handleFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {photoCount === 0 ? (
          <>
            <p className="dropzone__title">{t("project.dropzone.title")}</p>
            <p className="muted">{t("project.dropzone.subtitle")}</p>
          </>
        ) : (
          <p className="dropzone__title">{t("project.upload.more")}</p>
        )}
        {photoLimit !== null && <p className="muted">{t("project.limit.count", { count: photoCount, limit: photoLimit })}</p>}
      </section>

      {upload.limitNotice && (
        <>
          <p className="notice">{upload.limitNotice}</p>
          <PlanUpsell feature="photos" />
        </>
      )}
      {upload.inFlight.length > 0 && (
        <p className="muted upload-status">
          {t("project.uploading", { count: upload.inFlight.length, plural: upload.inFlight.length === 1 ? "" : "s" })}
        </p>
      )}
      {upload.failed.length > 0 && (
        <ul className="error-list">
          {upload.failed.map((transfer) => (
            <li key={transfer.key}>
              {transfer.fileName}: {transfer.message}
            </li>
          ))}
        </ul>
      )}

      {consentOpen && (
        <div className="modal-overlay" role="presentation" onClick={() => setConsentOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-consent-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="ai-consent-title">{t("ai.consent.title")}</h2>
            <p>{t("ai.consent.body")}</p>
            <div className="modal__actions">
              <button type="button" className="button" onClick={() => setConsentOpen(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  onUseAiChange(true);
                  setConsentOpen(false);
                }}
              >
                {t("ai.consent.agree")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
