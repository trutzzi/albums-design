import type { EmailSender } from "#src/shared-kernel/email";

export type ResetLanguage = "en" | "ro";

export interface PasswordResetEmail {
  to: string;
  name: string;
  /** The full reset URL, e.g. https://app.example.com/reset-password?token=… */
  url: string;
  language: ResetLanguage;
  expiresInMinutes: number;
}

const INK = "#14181c";
const SOFT = "#4b5560";
const FAINT = "#7c8791";
const LINE = "#e2e6e4";
const ACCENT = "#ad5522";
const PAPER = "#f4f5f3";
const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

function copyFor(email: PasswordResetEmail) {
  if (email.language === "ro") {
    return {
      subject: "Resetează parola AlbumFlow",
      greeting: `Salut, ${email.name}!`,
      lead: "Ai cerut o parolă nouă pentru contul tău AlbumFlow. Apasă butonul de mai jos pentru a o alege.",
      action: "Alege o parolă nouă",
      expiry: `Linkul funcționează ${email.expiresInMinutes} de minute și poate fi folosit o singură dată.`,
      ignore: "Dacă nu tu ai cerut asta, ignoră acest email — parola ta rămâne neschimbată.",
    };
  }
  return {
    subject: "Reset your AlbumFlow password",
    greeting: `Hi ${email.name}!`,
    lead: "You asked for a new password for your AlbumFlow account. Use the button below to choose one.",
    action: "Choose a new password",
    expiry: `The link works for ${email.expiresInMinutes} minutes and can be used once.`,
    ignore: "If you didn't ask for this, ignore this email — your password stays as it is.",
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The "forgot password" email, in the same visual style as the client invitations. */
export class PasswordResetMailer {
  constructor(private readonly email: EmailSender) {}

  async send(message: PasswordResetEmail): Promise<void> {
    const copy = copyFor(message);
    const { text, html } = actionEmail(copy, message.url);
    await this.email.send({ to: [message.to], subject: copy.subject, text, html });
  }
}

export interface ActionEmailCopy {
  greeting: string;
  lead: string;
  action: string;
  expiry: string;
  ignore: string;
}

/** One button, one link, two small print lines — the layout every account email shares. */
export function actionEmail(copy: ActionEmailCopy, url: string): { text: string; html: string } {
  const text = [copy.greeting, "", copy.lead, "", url, "", copy.expiry, copy.ignore].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${PAPER}">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${PAPER};padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:14px">
      <tr><td style="padding:28px 28px 0">
        <h1 style="margin:0 0 8px;font:700 22px/1.3 ${FONT};color:${INK}">${escapeHtml(copy.greeting)}</h1>
        <p style="margin:0;font:16px/1.6 ${FONT};color:${SOFT}">${escapeHtml(copy.lead)}</p>
      </td></tr>
      <tr><td style="padding:24px 28px 6px" align="center">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font:600 16px/1 ${FONT};padding:15px 30px;border-radius:10px">${escapeHtml(copy.action)}</a>
        <div style="padding-top:12px;font:13px/1.6 ${FONT};color:${FAINT};word-break:break-all">${escapeHtml(url)}</div>
      </td></tr>
      <tr><td style="padding:14px 28px 26px">
        <p style="margin:0 0 6px;font:14px/1.6 ${FONT};color:${FAINT}">${escapeHtml(copy.expiry)}</p>
        <p style="margin:0;font:14px/1.6 ${FONT};color:${FAINT}">${escapeHtml(copy.ignore)}</p>
      </td></tr>
    </table>
    <div style="padding:14px 0 0;font:12px/1.5 ${FONT};color:${FAINT}">AlbumFlow</div>
  </td></tr>
</table>
</body></html>`;
  return { text, html };
}
