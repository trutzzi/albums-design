import type { Env } from "../../shared-kernel/env";
import type { EmailSender } from "../../shared-kernel/email";
import { LoggingEmailSender } from "./logging-email-sender";
import { SmtpEmailSender } from "./smtp-email-sender";

/** The one place that turns `EMAIL_PROVIDER` into an adapter. */
export function buildEmailSender(env: Env): EmailSender {
  switch (env.EMAIL_PROVIDER) {
    case "smtp": {
      const missing = [
        ["SMTP_HOST", env.SMTP_HOST],
        ["MAIL_FROM", env.MAIL_FROM],
      ]
        .filter(([, value]) => !value)
        .map(([name]) => name);
      if (missing.length > 0) throw new Error(`EMAIL_PROVIDER=smtp requires: ${missing.join(", ")}`);
      // A login attempt with no password can only fail, and mail servers lock out repeated failures.
      if (env.SMTP_USER && !env.SMTP_PASSWORD) throw new Error("SMTP_USER is set but SMTP_PASSWORD is empty");
      return new SmtpEmailSender({
        host: env.SMTP_HOST!,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.MAIL_FROM!,
      });
    }
    case "none":
    default:
      return new LoggingEmailSender();
  }
}
