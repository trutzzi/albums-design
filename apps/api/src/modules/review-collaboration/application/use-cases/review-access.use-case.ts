import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";
import type { ClientAccessService } from "../services/client-access.service";
import type { ClientContactDirectory } from "../ports/client-contact";
import type { ClientLinkInvitations } from "../services/client-link-invitations";
import type { InvitationLanguage } from "../services/client-invitation.mailer";

/** The studio's window onto an album review link: the link itself and its password, readable again later. */
export class ReviewAccessUseCase {
  constructor(
    private readonly sessions: ReviewSessionRepository,
    private readonly access: ClientAccessService,
    private readonly invitations?: ClientLinkInvitations,
    private readonly contacts?: ClientContactDirectory,
  ) {}

  async reveal(
    albumId: string,
    sessionId: string,
  ): Promise<Result<{ token: string; password: string }, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    // The album in the path is what tenancy verified; the link must belong to it.
    if (!session || session.albumId.toString() !== albumId) {
      return Result.failure(new NotFoundError("Review link", sessionId));
    }
    const revealed = this.access.reveal(session);
    if (!revealed) {
      return Result.failure(
        new ConflictError(
          "This link was created before links could be shown again, so its details are not stored. Create a new link to get a viewable one.",
        ),
      );
    }
    return Result.success(revealed);
  }

  /** Emails an existing album review link — a resend, or one made before this existed. */
  async sendInvitation(
    albumId: string,
    sessionId: string,
    options: { email?: string | undefined; language?: InvitationLanguage | undefined } = {},
  ): Promise<Result<{ sentTo: string }, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    if (!session || session.albumId.toString() !== albumId) {
      return Result.failure(new NotFoundError("Review link", sessionId));
    }
    if (!this.invitations) return Result.failure(new ConflictError("Email is not configured on this server."));

    const known = await this.contacts?.forAlbum(albumId);
    const to = options.email?.trim() || session.lastSentTo || known?.email;
    if (!to) return Result.failure(new ValidationError("Enter the client's email address."));
    if (!known) return Result.failure(new NotFoundError("Album", albumId));

    const revealed = this.access.reveal(session);
    if (!revealed) {
      return Result.failure(
        new ConflictError(
          "This link was created before links could be shown again, so it cannot be emailed. Create a new one.",
        ),
      );
    }
    const invited = await this.invitations.invite({
      kind: "review",
      projectId: known.projectId,
      projectName: known.projectName,
      token: revealed.token,
      password: revealed.password,
      clientName: session.clientName,
      to,
      language: options.language ?? "en",
    });
    if (invited.error) return Result.failure(new ConflictError(`The email could not be sent: ${invited.error}`));
    session.recordSent(to);
    await this.sessions.save(session);
    return Result.success({ sentTo: to });
  }
}
