import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { sendContactMessage } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { contactErrorKey } from "./lib/contact";

const CONTACT_EMAIL = "contact@valentintruta.ro";
const EMPTY = { name: "", email: "", message: "", website: "" };

export function ContactPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState(EMPTY);
  const send = useMutation({ mutationFn: sendContactMessage, onSuccess: () => setForm(EMPTY) });
  // The form is replaced by the thank-you: move focus there, so it is read out and not lost.
  const sentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (send.isSuccess) sentRef.current?.focus();
  }, [send.isSuccess]);
  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>{t("contact.title")}</h1>
          <p className="muted">{t("contact.subtitle")}</p>
        </div>
      </header>

      <section className="panel contact-panel">
        {send.isSuccess ? (
          <div className="notice notice--good" role="status" tabIndex={-1} ref={sentRef}>
            <p>{t("contact.sent")}</p>
            <button type="button" className="button button--small" onClick={() => send.reset()}>
              {t("contact.another")}
            </button>
          </div>
        ) : (
          <form
            className="contact-form"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate(form);
            }}
          >
            <p>{t("contact.body")}</p>
            <div className="contact-form__row">
              <div className="field">
                <label htmlFor="contact-name">{t("contact.name")}</label>
                <input id="contact-name" autoComplete="name" required maxLength={120} {...field("name")} />
              </div>
              <div className="field">
                <label htmlFor="contact-email">{t("contact.email")}</label>
                <input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  {...field("email")}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="contact-message">{t("contact.message")}</label>
              <textarea id="contact-message" rows={6} required minLength={10} maxLength={4000} {...field("message")} />
            </div>
            {/* The honeypot: off-screen and skipped by keyboard and screen readers, so only a bot fills it. */}
            <div className="contact-form__trap" aria-hidden="true">
              <label htmlFor="contact-website">{t("contact.website")}</label>
              <input id="contact-website" tabIndex={-1} autoComplete="off" {...field("website")} />
            </div>
            {send.isError && (
              <p className="error" role="alert">
                {t(contactErrorKey(send.error), { email: CONTACT_EMAIL })}
              </p>
            )}
            <button type="submit" className="button button--primary" disabled={send.isPending}>
              {send.isPending ? t("contact.sending") : t("contact.send")}
            </button>
          </form>
        )}
        <p className="muted contact-panel__direct">
          {t("contact.direct")} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>
    </div>
  );
}
