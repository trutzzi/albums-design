import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../lib/i18n/LanguageContext";

interface Props {
  title: string;
  /** Builds the client-facing URL from the token, e.g. `/review/<token>`. */
  urlFor: (token: string) => string;
  load: () => Promise<{ token: string; password: string }>;
  queryKey: readonly unknown[];
  /** Emails this link to the client. Omitted when the server has no email configured. */
  onSend?: ((input: { email: string; language: "en" | "ro" }) => Promise<unknown>) | undefined;
  /** The address already on file for this shoot, so the photographer rarely types one. */
  defaultEmail?: string | undefined;
  onClose: () => void;
}

/**
 * What the studio opens to see a client link again: the link and its password,
 * each with a copy button, and one button that copies both as a message ready
 * to paste into WhatsApp or an email.
 */
export function AccessDetailsModal({ title, urlFor, load, queryKey, onSend, defaultEmail, onClose }: Props) {
  const { t, language } = useLanguage();
  const [copied, setCopied] = useState<string | null>(null);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [emailLanguage, setEmailLanguage] = useState<"en" | "ro">(language);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!onSend || !email.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend({ email: email.trim(), language: emailLanguage });
      setSentTo(email.trim());
    } catch (error) {
      setSendError((error as Error).message);
    } finally {
      setSending(false);
    }
  };
  const details = useQuery({ queryKey, queryFn: load, retry: false });

  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((current) => (current === id ? null : current)), 1800);
    });
  };

  const url = details.data ? urlFor(details.data.token) : "";
  const password = details.data?.password ?? "";

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal access-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="access-title">{title}</h2>
        {details.isLoading && <p className="muted">{t("access.details.loading")}</p>}
        {details.isError && <p className="error">{t("access.details.legacy")}</p>}
        {details.data && (
          <>
            <div className="access-modal__row">
              <span className="muted">{t("access.details.link")}</span>
              <code className="access-modal__value">{url}</code>
              <button type="button" className="button button--small" onClick={() => copy("link", url)}>
                {copied === "link" ? t("access.details.copied") : t("access.details.copyLink")}
              </button>
            </div>
            <div className="access-modal__row">
              <span className="muted">{t("access.details.password")}</span>
              <code className="access-modal__value access-modal__password">{password}</code>
              <button type="button" className="button button--small" onClick={() => copy("password", password)}>
                {copied === "password" ? t("access.details.copied") : t("access.details.copyPassword")}
              </button>
            </div>
            <button
              type="button"
              className="button button--primary"
              onClick={() => copy("both", t("access.details.message", { link: url, password }))}
            >
              {copied === "both" ? t("access.details.copied") : t("access.details.copyBoth")}
            </button>
            <p className="muted">{t("access.details.note")}</p>

            {onSend && (
              <form className="access-modal__send" onSubmit={send}>
                <h3>{t("client.send.title")}</h3>
                <div className="access-modal__send-row">
                  <input
                    type="email"
                    value={email}
                    placeholder={t("client.email.placeholder")}
                    aria-label={t("client.email")}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <select
                    value={emailLanguage}
                    aria-label={t("client.emailLanguage")}
                    onChange={(event) => setEmailLanguage(event.target.value as "en" | "ro")}
                  >
                    <option value="en">English</option>
                    <option value="ro">Română</option>
                  </select>
                  <button type="submit" className="button button--primary" disabled={sending || !email.trim()}>
                    {sending ? t("client.send.sending") : t("client.send.button")}
                  </button>
                </div>
                <p className="muted">{t("client.send.hint")}</p>
                {sentTo && (
                  <p className="notice notice--good" role="status">
                    {t("client.send.done", { email: sentTo })}
                  </p>
                )}
                {sendError && (
                  <p className="error" role="alert">
                    {sendError}
                  </p>
                )}
              </form>
            )}
          </>
        )}
        <div className="modal__actions">
          <button type="button" className="button" onClick={onClose}>
            {t("pick.lightbox.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
