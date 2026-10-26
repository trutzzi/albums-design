import { Result } from "@albumflow/domain-kernel";
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
 * message disappears silently.
 */
export class ContactMessageUseCase {
  constructor(
    private readonly email: EmailSender,
    private readonly recipient: string,
    private readonly logger: Logger,
    /** Caps messages per address, so the form cannot flood the inbox. */
    private readonly limiter: AttemptLimiter = new AttemptLimiter(5, 60 * 60 * 1000),
  ) {}

  async send(contact: ContactMessage): Promise<Result<void, ApplicationError>> {
    // Answer a bot exactly as a person, so it learns nothing from the honeypot.
    if (contact.website?.trim()) return Result.success(undefined);

    const key = `contact:${contact.ip}`;
    const locked = this.limiter.lockedFor(key);
    if (locked > 0) return Result.failure(new TooManyAttemptsError(locked, "messages"));
    this.limiter.recordFailure(key);

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
      return Result.failure(
        new ApplicationError("Your message could not be sent. Please try again in a few minutes.", "MESSAGE_NOT_SENT"),
      );
    }
  }
}
