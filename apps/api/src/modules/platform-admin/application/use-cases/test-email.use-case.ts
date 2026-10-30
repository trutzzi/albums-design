import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ApplicationError, NotFoundError } from "#src/shared-kernel/errors";
import type { EmailSender } from "#src/shared-kernel/email";
import type { Logger } from "#src/shared-kernel/logger";
import type { StudioMemberRepository } from "#src/modules/identity/domain/repositories";

/**
 * "Send a test email to me", for the operator: proves the mail server takes a message
 * from this deploy, or says exactly why not — the server's own answer, since the admin
 * is the one who fixes the SMTP settings. Acceptance is all it can prove: a message the
 * server took can still be delayed or junked by the recipient's provider.
 */
export class TestEmailUseCase {
  constructor(
    private readonly email: EmailSender,
    private readonly members: StudioMemberRepository,
    private readonly mail: {
      /** False when the sender only writes to the log (no mail server configured). */
      delivers: boolean;
      /** The From address (MAIL_FROM), shown to the admin with the result. */
      from: string | undefined;
    },
    private readonly logger: Logger,
  ) {}

  async send(memberId: string): Promise<Result<{ sentTo: string; from: string | null }, ApplicationError>> {
    const member = await this.members.findById(UniqueEntityId.create(memberId));
    if (!member) return Result.failure(new NotFoundError("Member", memberId));

    if (!this.mail.delivers) {
      return Result.failure(
        new ApplicationError(
          "No mail server is configured on this server (EMAIL_PROVIDER is not smtp), so no email is sent at all.",
          "MESSAGE_NOT_SENT",
        ),
      );
    }

    try {
      await this.email.send({
        to: [member.email],
        subject: "AlbumFlow test email",
        text: [
          "This is the test email you asked for from AlbumFlow's admin page.",
          "If it is here, the mail server sends. If studio notifications still go missing, look in spam",
          "and check the domain's SPF, DKIM and DMARC records.",
        ].join("\n"),
      });
      return Result.success({ sentTo: member.email, from: this.mail.from ?? null });
    } catch (error) {
      this.logger.error("test email not sent", { memberId, err: error });
      const reason = error instanceof Error ? error.message : String(error);
      return Result.failure(
        new ApplicationError(
          answered(error) ? `The mail server refused: ${reason}` : `Could not reach the mail server: ${reason}`,
          "MESSAGE_NOT_SENT",
        ),
      );
    }
  }
}

/**
 * Whether the mail server itself said no. An SMTP reply carries its status code
 * (`responseCode`, 535 for a wrong password); a timeout, a refused connection or a
 * host that does not resolve never got that far — a different fix for the admin.
 */
function answered(error: unknown): boolean {
  return typeof (error as { responseCode?: unknown } | null)?.responseCode === "number";
}
