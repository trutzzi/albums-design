import { useState, type ReactNode } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";

/** What happened to the invitation email, when the photographer asked for one. */
export interface EmailNote {
  sentTo?: string;
  error?: string;
}

/** A freshly created link: shown once (only its hash is stored), with its password. */
export interface CreatedLink {
  url: string;
  password: string | null;
}

export function noteFrom(session: { emailSentTo?: string | null; emailError?: string | null }): EmailNote | null {
  return session.emailSentTo ? { sentTo: session.emailSentTo } : session.emailError ? { error: session.emailError } : null;
}

/** The outcome of creating a client link: the email note, then the link to copy and its password. */
export function LinkResult(props: {
  note: EmailNote | null;
  error: Error | null;
  link: CreatedLink | null;
  readyLabel: string;
  copyLabel: string;
  copiedLabel: string;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState<string | null>(null);
  const { link } = props;
  return (
    <>
      {props.note?.sentTo && (
        <p className="notice notice--good" role="status">
          {t("client.send.done", { email: props.note.sentTo })}
        </p>
      )}
      {props.note?.error && (
        <p className="notice" role="alert">
          {t("client.notSent", { reason: props.note.error })}
        </p>
      )}
      {props.error && <p className="error">{props.error.message}</p>}
      {link && (
        <div className="share-link">
          <p className="muted">{props.readyLabel}</p>
          <a href={link.url}>{link.url}</a>{" "}
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              void navigator.clipboard?.writeText(link.url).then(() => setCopied(link.url));
            }}
          >
            {copied === link.url ? props.copiedLabel : props.copyLabel}
          </button>
          {link.password && (
            <p>
              <span className="muted">{t("access.details.password")}: </span>
              <code className="access-modal__password">{link.password}</code>
            </p>
          )}
          {props.children}
        </div>
      )}
    </>
  );
}
