import { Result } from "@albumflow/domain-kernel";
import { addressKey } from "#src/shared-kernel/address-key";
import { AttemptLimiter } from "#src/shared-kernel/attempt-limiter";
import type { EmailSender } from "#src/shared-kernel/email";
import { ApplicationError, TooManyAttemptsError } from "#src/shared-kernel/errors";
import type { Logger } from "#src/shared-kernel/logger";

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
  /** The honeypot: a field people never see, so only a bot fills it in. */
  website?: string | undefined;
  /** Who sent it, for the rate limit. */
  ip: string;
}

/**
 * The public contact form: each message is emailed to AlbumFlow, with Reply-To set to the
 * visitor so answering is one click. Nothing is stored. A failed send is logged at error
 * level (it reaches the Errors tab and Sentry) and the visitor is asked to try again, so no
 * message disappears silently — including when no mail server is configured at all, where
 * the log-only sender would otherwise "succeed".
 *
 * Sent within the request, like every other email in the app, so the visitor can be told
 * when it failed; the SMTP timeouts bound the wait, and the rate limits bound how often.
 */
export class ContactMessageUseCase {
  constructor(
    private readonly email: EmailSender,
    private readonly recipient: string,
    private readonly logger: Logger,
    /** False when `email` only writes to the log (EMAIL_PROVIDER=none): nothing would arrive. */
    private readonly delivers: boolean,
    /** Caps messages per address, so the form cannot flood the inbox. */
    private readonly limiter: AttemptLimiter = new AttemptLimiter(5, 60 * 60 * 1000),
    /** Caps all messages together: a backstop if many addresses send at once. */
    private readonly overall: AttemptLimiter = new AttemptLimiter(100, 60 * 60 * 1000),
  ) {}

  async send(contact: ContactMessage): Promise<Result<void, ApplicationError>> {
    // Answer a bot exactly as a person, so it learns nothing from the honeypot.
    if (contact.website?.trim()) return Result.success(undefined);

    if (!this.delivers) {
      this.logger.error("contact message not sent: no mail server is configured (EMAIL_PROVIDER)");
      return Result.failure(notSent());
    }

    const key = `contact:${addressKey(contact.ip)}`;
    const locked = Math.max(this.limiter.lockedFor(key), this.overall.lockedFor(OVERALL));
    if (locked > 0) return Result.failure(new TooManyAttemptsError(locked, "messages"));
    this.limiter.recordFailure(key);
    this.overall.recordFailure(OVERALL);

    const name = contact.name.trim();
    const from = contact.email.trim();
    try {
      await this.email.send({
        to: [this.recipient],
        replyTo: from,
        senderName: `${name} via AlbumFlow`,
        subject: `Contact form: ${name}`,
        text: `${contact.message.trim()}\n\n— ${name} <${from}>`,
      });
      return Result.success(undefined);
    } catch (error) {
      this.logger.error("contact message not sent", {
        provider: this.email.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return Result.failure(notSent());
    }
  }
}

const OVERALL = "contact:all";

function notSent(): ApplicationError {
  return new ApplicationError("Your message could not be sent. Please try again in a few minutes.", "MESSAGE_NOT_SENT");
}
