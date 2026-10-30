import type { EmailMessage, EmailSender } from "../../shared-kernel/email";
import { consoleLogger, type Logger } from "../../shared-kernel/logger";

/** The id of the log-only sender: what composition checks to know mail would not arrive. */
export const LOGGING_SENDER_ID = "log";

/**
 * Used when no mail server is configured: the email is written to the log instead of sent, so the feature is visible in demos.
 *
 * Outside a demo the body must stay out: it carries password-reset and confirmation links and
 * client link passwords, and the address and subject name people. Production only learns that a
 * message was dropped: the first time at error, so it reaches the admin Errors tab and Sentry
 * (a studio waiting for client notifications that never come is a broken deploy, not a quirk),
 * and at warn after that, so one missing setting does not bury the inbox.
 */
export class LoggingEmailSender implements EmailSender {
  readonly id = LOGGING_SENDER_ID;
  private reported = false;
  constructor(
    private readonly logger: Logger = consoleLogger,
    /** Off unless a caller that is certainly not production asks: forgetting it must not leak. */
    private readonly options: { includeContent: boolean } = { includeContent: false },
  ) {}

  async send(message: EmailMessage): Promise<void> {
    if (!this.options.includeContent) {
      const context = { recipients: message.to.length };
      if (this.reported) {
        this.logger.warn("email not sent: no SMTP configured", context);
      } else {
        this.reported = true;
        this.logger.error("email not sent: no mail server is configured (EMAIL_PROVIDER)", context);
      }
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
