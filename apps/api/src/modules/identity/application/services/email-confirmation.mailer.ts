import type { EmailSender } from "#src/shared-kernel/email";
import { actionEmail, type ResetLanguage } from "./password-reset.mailer";

export interface EmailConfirmationEmail {
  to: string;
  name: string;
  /** The full confirmation URL, e.g. https://app.example.com/verify-email?token=… */
  url: string;
  language: ResetLanguage;
  expiresInHours: number;
}

function copyFor(email: EmailConfirmationEmail) {
  if (email.language === "ro") {
    return {
      subject: "Confirmă adresa de email pentru AlbumFlow",
      greeting: `Bun venit, ${email.name}!`,
      lead: "Mai e un singur pas: confirmă că adresa aceasta îți aparține și contul tău AlbumFlow e gata de folosit.",
      action: "Confirmă adresa de email",
      expiry: `Linkul funcționează ${email.expiresInHours} de ore.`,
      ignore: "Dacă nu tu ți-ai creat contul, ignoră acest email — contul nu va fi activat.",
    };
  }
  return {
    subject: "Confirm your email for AlbumFlow",
    greeting: `Welcome, ${email.name}!`,
    lead: "One last step: confirm this address is yours and your AlbumFlow account is ready to use.",
    action: "Confirm my email",
    expiry: `The link works for ${email.expiresInHours} hours.`,
    ignore: "If you didn't create this account, ignore this email — it will not be activated.",
  };
}

/** Sent after signing up; the account cannot log in until its link is opened. */
export class EmailConfirmationMailer {
  constructor(private readonly email: EmailSender) {}

  async send(message: EmailConfirmationEmail): Promise<void> {
    const copy = copyFor(message);
    const { text, html } = actionEmail(copy, message.url);
    await this.email.send({ to: [message.to], subject: copy.subject, text, html });
  }
}
