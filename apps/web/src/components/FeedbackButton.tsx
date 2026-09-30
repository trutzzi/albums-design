import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ApiError, submitFeedback, type FeedbackKind } from "../lib/api";
import { useLanguage } from "../lib/i18n/LanguageContext";

const KINDS: FeedbackKind[] = ["IDEA", "PROBLEM", "QUESTION", "PRAISE"];

/** "Tell us" from anywhere in the studio app — the page it was sent from goes with it. */
export function FeedbackButton() {
  const { t } = useLanguage();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("IDEA");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);

  const send = useMutation({
    mutationFn: () =>
      submitFeedback({
        kind,
        message,
        page: location.pathname,
        ...(rating ? { rating } : {}),
      }),
  });

  const close = () => {
    setOpen(false);
    if (send.isSuccess) {
      setMessage("");
      setRating(null);
      setKind("IDEA");
      send.reset();
    }
  };

  return (
    <>
      <button type="button" className="link-button" onClick={() => setOpen(true)} data-tour="nav-feedback">
        {t("feedbackForm.open")}
      </button>
      {/* Portalled: on phones the button lives in the header menu, which closes (and hides
          everything inside it) the moment the button is tapped. */}
      {open &&
        createPortal(
        <div className="modal-overlay" role="presentation" onClick={close}>
          <div
            className="modal feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.key === "Escape" && close()}
          >
            <h2 id="feedback-title">{t("feedbackForm.title")}</h2>
            {send.isSuccess ? (
              <>
                <p>{t("feedbackForm.thanks")}</p>
                <div className="modal__actions">
                  <button type="button" className="button button--primary" onClick={close}>
                    {t("common.close")}
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (message.trim()) send.mutate();
                }}
              >
                <div className="feedback-kinds" role="radiogroup" aria-label={t("feedbackForm.kind")}>
                  {KINDS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={kind === option}
                      className={`button button--small ${kind === option ? "button--primary" : ""}`}
                      onClick={() => setKind(option)}
                    >
                      {t(`feedbackForm.kind.${option}`)}
                    </button>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="feedback-message">{t(`feedbackForm.prompt.${kind}`)}</label>
                  <textarea
                    id="feedback-message"
                    rows={5}
                    maxLength={4000}
                    required
                    autoFocus
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </div>
                <div className="field">
                  <span className="field__label">{t("feedbackForm.rating")}</span>
                  <div className="feedback-rating" role="radiogroup" aria-label={t("feedbackForm.rating")}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={rating === value}
                        aria-label={`${value} / 5`}
                        className={`feedback-rating__star ${rating !== null && value <= rating ? "is-on" : ""}`}
                        onClick={() => setRating(rating === value ? null : value)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                {send.isError && (
                  <p className="error">{send.error instanceof ApiError ? send.error.message : t("auth.error.generic")}</p>
                )}
                <div className="modal__actions">
                  <button type="button" className="button" onClick={close}>
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className="button button--primary" disabled={send.isPending || !message.trim()}>
                    {send.isPending ? t("feedbackForm.sending") : t("feedbackForm.send")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
