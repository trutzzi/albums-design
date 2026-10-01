import type { EmailMessage, EmailSender } from "../../shared-kernel/email";
import { consoleLogger, type Logger } from "../../shared-kernel/logger";

/** Used when no mail server is configured: the email is written to the log instead of sent, so the feature is visible in demos. */
export class LoggingEmailSender implements EmailSender {
  readonly id = "log";
  constructor(private readonly logger: Logger = consoleLogger) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.info("email not sent: no SMTP configured", {
      to: message.to,
      ...(message.senderName ? { from: message.senderName } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      subject: message.subject,
      text: message.text,
    });
  }
}
