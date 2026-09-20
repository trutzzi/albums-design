import type { EmailMessage, EmailSender } from "../../shared-kernel/email";

/** Used when no mail server is configured: the email is written to the log instead of sent, so the feature is visible in demos. */
export class LoggingEmailSender implements EmailSender {
  readonly id = "log";
  constructor(private readonly log: (message: string) => void = console.log) {}

  async send(message: EmailMessage): Promise<void> {
    this.log(
      `[email] (not sent — no SMTP configured) to ${message.to.join(", ")}` +
        (message.replyTo ? ` (reply-to ${message.replyTo})` : "") +
        `\n  subject: ${message.subject}\n  ${message.text.split("\n").join("\n  ")}`,
    );
  }
}
