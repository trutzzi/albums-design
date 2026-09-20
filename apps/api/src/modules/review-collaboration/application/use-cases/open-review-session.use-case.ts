import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, type ApplicationError } from "../../../../shared-kernel/errors";
import { ReviewSession } from "../../domain/review-session";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";
import type { AlbumGateway } from "../ports/album-gateway";
import type { ClientAccessService } from "../services/client-access.service";
import type { ClientContactDirectory } from "../ports/client-contact";
import type { ClientLinkInvitations } from "../services/client-link-invitations";
import type { InvitationLanguage } from "../services/client-invitation.mailer";

export interface OpenReviewSessionCommand {
  albumId: string;
  clientName: string;
  ttlDays?: number;
  clientEmail?: string | undefined;
  sendEmail?: boolean | undefined;
  language?: InvitationLanguage | undefined;
}

export interface OpenReviewSessionResult {
  sessionId: string;
  token: string;
  expiresAt: string;
  /** The generated password the client must enter. Absent when passwords are not configured. */
  password?: string;
  emailSentTo?: string;
  emailError?: string;
}

export class OpenReviewSessionUseCase {
  constructor(
    private readonly sessions: ReviewSessionRepository,
    private readonly albums: AlbumGateway,
    private readonly access?: ClientAccessService,
    private readonly invitations?: ClientLinkInvitations,
    private readonly contacts?: ClientContactDirectory,
  ) {}

  async execute(
    command: OpenReviewSessionCommand,
  ): Promise<Result<OpenReviewSessionResult, ApplicationError>> {
    const album = await this.albums.load(command.albumId);
    if (!album) return Result.failure(new NotFoundError("Album", command.albumId));

    const known = await this.contacts?.forAlbum(command.albumId);
    const clientName = command.clientName.trim() || known?.name || "Client";
    const to = command.clientEmail?.trim() || known?.email;

    const { session, token } = ReviewSession.open({
      albumId: UniqueEntityId.create(command.albumId),
      clientName,
      ...(command.ttlDays ? { ttlDays: command.ttlDays } : {}),
    });

    const issued = this.access ? await this.access.issue(token) : undefined;
    if (issued) session.protectWith(issued);

    await this.sessions.save(session);
    await this.albums.markInReview(command.albumId);

    const invited =
      command.sendEmail && to && this.invitations && known
        ? await this.invitations.invite({
            kind: "review",
            projectId: known.projectId,
            projectName: known.projectName,
            token,
            password: issued?.password,
            clientName,
            to,
            language: command.language ?? "en",
          })
        : undefined;
    if (invited?.sentTo) {
      session.recordSent(invited.sentTo);
      await this.sessions.save(session);
    } else if (!command.sendEmail && known) {
      await this.contacts?.remember(known.projectId, { name: clientName, email: to });
    }

    return Result.success({
      sessionId: session.id.toString(),
      token,
      expiresAt: session.expiresAt.toISOString(),
      ...(issued ? { password: issued.password } : {}),
      ...(invited?.sentTo ? { emailSentTo: invited.sentTo } : {}),
      ...(invited?.error ? { emailError: invited.error } : {}),
    });
  }
}
