import type { EmailMessage, EmailSender } from "../../shared-kernel/email";
import { consoleLogger, type Logger } from "../../shared-kernel/logger";

/**
 * Used when no mail server is configured: the email is written to the log instead of sent, so the feature is visible in demos.
 *
 * Outside a demo the body must stay out: it carries password-reset and confirmation links and
 * client link passwords, and the address and subject name people. Production only learns that a
 * message was dropped — at warn, because someone is now waiting for an email that never comes.
 */
export class LoggingEmailSender implements EmailSender {
  readonly id = "log";
  constructor(
    private readonly logger: Logger = consoleLogger,
    private readonly options: { includeContent: boolean } = { includeContent: true },
  ) {}

  async send(message: EmailMessage): Promise<void> {
    if (!this.options.includeContent) {
      this.logger.warn("email not sent: no SMTP configured", { recipients: message.to.length });
      return;
    }
    this.logger.info("email not sent: no SMTP configured", {
      to: message.to,
      ...(message.senderName ? { from: message.senderName } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      subject: message.subject,
      text: message.text,
    });
  }
}
