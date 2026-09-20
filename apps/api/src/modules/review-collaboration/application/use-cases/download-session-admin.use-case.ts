import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import { DownloadSession } from "../../domain/download-session";
import type { DownloadSessionRepository } from "../../domain/download-session-repository";
import type { DeliveryGateway } from "../ports/delivery-gateway";
import type { ClientAccessService } from "../services/client-access.service";
import type { ClientContactDirectory } from "../ports/client-contact";
import type { ClientLinkInvitations } from "../services/client-link-invitations";
import type { InvitationLanguage } from "../services/client-invitation.mailer";

export interface DownloadSessionSummary {
  id: string;
  clientName: string;
  /** EXPIRED is derived from the clock; it is never stored. */
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  /** Whether the client has to enter a password (links from before passwords existed do not). */
  passwordProtected: boolean;
  downloadCount: number;
  firstDownloadedAt: string | null;
  lastDownloadedAt: string | null;
  /** Who the link was last emailed to, and when. */
  lastSentTo: string | null;
  lastSentAt: string | null;
  expiresAt: string;
  daysLeft: number;
  createdAt: string;
}

/** The photographer's side of delivery: create a link, watch whether it was used, close it. */
export class DownloadSessionAdminUseCase {
  constructor(
    private readonly sessions: DownloadSessionRepository,
    private readonly delivery: DeliveryGateway,
    private readonly now: () => Date = () => new Date(),
    private readonly access?: ClientAccessService,
    private readonly invitations?: ClientLinkInvitations,
    private readonly contacts?: ClientContactDirectory,
  ) {}

  async open(command: {
    projectId: string;
    clientName: string;
    ttlDays?: number | undefined;
    clientEmail?: string | undefined;
    sendEmail?: boolean | undefined;
    language?: InvitationLanguage | undefined;
  }): Promise<
    Result<
      {
        sessionId: string;
        token: string;
        expiresAt: string;
        photoCount: number;
        missingCount: number;
        password?: string;
        emailSentTo?: string;
        emailError?: string;
      },
      ApplicationError
    >
  > {
    const project = await this.delivery.loadProject(command.projectId);
    if (!project) {
      return Result.failure(new NotFoundError("Project", command.projectId));
    }
    const known = await this.contacts?.forProject(command.projectId);
    const clientName = command.clientName.trim() || known?.name || "Client";
    const to = command.clientEmail?.trim() || known?.email;

    const { session, token } = DownloadSession.open({
      projectId: UniqueEntityId.create(command.projectId),
      clientName,
      ...(command.ttlDays ? { ttlDays: command.ttlDays } : {}),
    });
    const issued = this.access ? await this.access.issue(token) : undefined;
    if (issued) session.protectWith(issued);
    await this.sessions.save(session);

    const { available, missing } = await this.delivery.listDeliverable(command.projectId);

    const invited =
      command.sendEmail && to && this.invitations
        ? await this.invitations.invite({
            kind: "download",
            projectId: command.projectId,
            projectName: project.name,
            token,
            password: issued?.password,
            clientName,
            to,
            language: command.language ?? "en",
            availableUntil: session.expiresAt,
          })
        : undefined;
    if (invited?.sentTo) {
      session.recordSent(invited.sentTo);
      await this.sessions.save(session);
    } else if (!command.sendEmail) {
      await this.contacts?.remember(command.projectId, { name: clientName, email: to });
    }

    return Result.success({
      sessionId: session.id.toString(),
      token,
      expiresAt: session.expiresAt.toISOString(),
      photoCount: available.length,
      missingCount: missing,
      ...(issued ? { password: issued.password } : {}),
      ...(invited?.sentTo ? { emailSentTo: invited.sentTo } : {}),
      ...(invited?.error ? { emailError: invited.error } : {}),
    });
  }

  /** Emails an existing download link — a resend, or one made before this existed. */
  async sendInvitation(
    projectId: string,
    sessionId: string,
    options: { email?: string | undefined; language?: InvitationLanguage | undefined } = {},
  ): Promise<Result<DownloadSessionSummary, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    if (!session || session.projectId.toString() !== projectId) {
      return Result.failure(new NotFoundError("Download link", sessionId));
    }
    if (!this.invitations) return Result.failure(new ConflictError("Email is not configured on this server."));

    const known = await this.contacts?.forProject(projectId);
    const to = options.email?.trim() || session.lastSentTo || known?.email;
    if (!to) return Result.failure(new ValidationError("Enter the client's email address."));

    const revealed = this.access?.reveal(session);
    if (!revealed) {
      return Result.failure(
        new ConflictError(
          "This link was created before links could be shown again, so it cannot be emailed. Create a new one.",
        ),
      );
    }
    const project = await this.delivery.loadProject(projectId);
    const invited = await this.invitations.invite({
      kind: "download",
      projectId,
      projectName: project?.name ?? known?.projectName ?? "",
      token: revealed.token,
      password: revealed.password,
      clientName: session.clientName,
      to,
      language: options.language ?? "en",
      availableUntil: session.expiresAt,
    });
    if (invited.error) return Result.failure(new ConflictError(`The email could not be sent: ${invited.error}`));
    session.recordSent(to);
    await this.sessions.save(session);
    return Result.success(this.toSummary(session));
  }

  /** The link and password, readable again by the studio. */
  async reveal(
    projectId: string,
    sessionId: string,
  ): Promise<Result<{ token: string; password: string }, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    if (!session || session.projectId.toString() !== projectId) {
      return Result.failure(new NotFoundError("Download link", sessionId));
    }
    const revealed = this.access?.reveal(session);
    if (!revealed) {
      return Result.failure(
        new ConflictError(
          "This link was created before links could be shown again, so its details are not stored. Create a new link to get a viewable one.",
        ),
      );
    }
    return Result.success(revealed);
  }

  async list(projectId: string): Promise<DownloadSessionSummary[]> {
    const sessions = await this.sessions.findByProjectId(UniqueEntityId.create(projectId));
    return sessions
      .map((session) => this.toSummary(session))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revoke(projectId: string, sessionId: string): Promise<Result<DownloadSessionSummary, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    // The project in the path is what tenancy verified; the link must belong to it.
    if (!session || session.projectId.toString() !== projectId) {
      return Result.failure(new NotFoundError("Download link", sessionId));
    }
    session.revoke();
    await this.sessions.save(session);
    return Result.success(this.toSummary(session));
  }

  private toSummary(session: DownloadSession): DownloadSessionSummary {
    const now = this.now();
    return {
      id: session.id.toString(),
      clientName: session.clientName,
      passwordProtected: Boolean(session.passwordHash),
      status: session.status === "REVOKED" ? "REVOKED" : session.isExpired(now) ? "EXPIRED" : "ACTIVE",
      downloadCount: session.downloadCount,
      firstDownloadedAt: session.firstDownloadedAt?.toISOString() ?? null,
      lastDownloadedAt: session.lastDownloadedAt?.toISOString() ?? null,
      lastSentTo: session.lastSentTo ?? null,
      lastSentAt: session.lastSentAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
      daysLeft: session.daysLeft(now),
      createdAt: session.createdAt.toISOString(),
    };
  }
}
