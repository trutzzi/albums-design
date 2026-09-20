import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import { PickClosedError, PickSession, type PickStatus } from "../../domain/pick-session";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import type { PickStage } from "../../domain/pick-session";
import type { PickGateway } from "../ports/pick-gateway";
import type { ClientContactDirectory } from "../ports/client-contact";
import type { ClientLinkInvitations } from "../services/client-link-invitations";
import type { InvitationLanguage } from "../services/client-invitation.mailer";
import type { ClientAccessService } from "../services/client-access.service";

export interface OpenPickSessionCommand {
  projectId: string;
  clientName: string;
  pickLimit?: number | undefined;
  ttlDays?: number | undefined;
  /** Where to email the link. Remembered on the shoot either way. */
  clientEmail?: string | undefined;
  /** Only sends when the photographer asked for it. */
  sendEmail?: boolean | undefined;
  language?: InvitationLanguage | undefined;
}

export interface PickSessionSummary {
  id: string;
  clientName: string;
  status: PickStatus;
  pickLimit: number | null;
  /** Whether the client has to enter a password (links from before passwords existed do not). */
  passwordProtected: boolean;
  /** Which of the two steps the client is on. */
  stage: PickStage;
  /** Step 1: how many they marked as possibilities. */
  shortlistedCount: number;
  /** Step 2: how many they finally chose. */
  pickedCount: number;
  pickedPhotoIds: string[];
  submittedAt: string | null;
  /** Who the link was last emailed to, and when. */
  lastSentTo: string | null;
  lastSentAt: string | null;
  expiresAt: string;
  createdAt: string;
}

/** The photographer's side of client selection: create a link, watch it, reopen or close it. */
export class PickSessionAdminUseCase {
  constructor(
    private readonly sessions: PickSessionRepository,
    private readonly gateway: PickGateway,
    private readonly access?: ClientAccessService,
    private readonly invitations?: ClientLinkInvitations,
    private readonly contacts?: ClientContactDirectory,
  ) {}

  async open(
    command: OpenPickSessionCommand,
  ): Promise<
    Result<
      {
        sessionId: string;
        token: string;
        expiresAt: string;
        password?: string;
        emailSentTo?: string;
        emailError?: string;
      },
      ApplicationError
    >
  > {
    const project = await this.gateway.loadProject(command.projectId);
    if (!project) return Result.failure(new NotFoundError("Project", command.projectId));

    // Whatever the photographer left blank falls back to what the shoot already knows.
    const known = await this.contacts?.forProject(command.projectId);
    const clientName = command.clientName.trim() || known?.name || "Client";
    const to = command.clientEmail?.trim() || known?.email;

    const { session, token } = PickSession.open({
      projectId: UniqueEntityId.create(command.projectId),
      clientName,
      ...(command.pickLimit ? { pickLimit: command.pickLimit } : {}),
      ...(command.ttlDays ? { ttlDays: command.ttlDays } : {}),
    });
    const issued = this.access ? await this.access.issue(token) : undefined;
    if (issued) session.protectWith(issued);
    await this.sessions.save(session);

    const invited =
      command.sendEmail && to && this.invitations
        ? await this.invitations.invite({
            kind: "pick",
            projectId: command.projectId,
            projectName: project.name,
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
    } else if (!command.sendEmail) {
      // Not sending is no reason to forget who the shoot is for.
      await this.contacts?.remember(command.projectId, { name: clientName, email: to });
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

  /**
   * Emails an existing link — a resend, or a link made before this existed. The token is
   * recovered from the sealed copy, so a link whose details were never stored cannot be sent.
   */
  async sendInvitation(
    projectId: string,
    sessionId: string,
    options: { email?: string | undefined; language?: InvitationLanguage | undefined } = {},
  ): Promise<Result<PickSessionSummary, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    if (!session || session.projectId.toString() !== projectId) {
      return Result.failure(new NotFoundError("Selection link", sessionId));
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
    const project = await this.gateway.loadProject(projectId);
    const invited = await this.invitations.invite({
      kind: "pick",
      projectId,
      projectName: project?.name ?? known?.projectName ?? "",
      token: revealed.token,
      password: revealed.password,
      clientName: session.clientName,
      to,
      language: options.language ?? "en",
    });
    if (invited.error) return Result.failure(new ConflictError(`The email could not be sent: ${invited.error}`));
    session.recordSent(to);
    await this.sessions.save(session);
    return Result.success(toSummary(session));
  }

  /** The link and password, readable again by the studio. */
  async reveal(
    projectId: string,
    sessionId: string,
  ): Promise<Result<{ token: string; password: string }, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    if (!session || session.projectId.toString() !== projectId) {
      return Result.failure(new NotFoundError("Selection link", sessionId));
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

  async list(projectId: string): Promise<PickSessionSummary[]> {
    const sessions = await this.sessions.findByProjectId(UniqueEntityId.create(projectId));
    return sessions
      .map(toSummary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  reopen(projectId: string, sessionId: string): Promise<Result<PickSessionSummary, ApplicationError>> {
    return this.change(projectId, sessionId, (session) => session.reopen());
  }

  revoke(projectId: string, sessionId: string): Promise<Result<PickSessionSummary, ApplicationError>> {
    return this.change(projectId, sessionId, (session) => session.revoke());
  }

  private async change(
    projectId: string,
    sessionId: string,
    apply: (session: PickSession) => void,
  ): Promise<Result<PickSessionSummary, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    // The project in the path is what tenancy verified; the session must belong to it.
    if (!session || session.projectId.toString() !== projectId) {
      return Result.failure(new NotFoundError("Selection link", sessionId));
    }
    try {
      apply(session);
    } catch (error) {
      if (error instanceof PickClosedError) return Result.failure(new ConflictError(error.message));
      throw error;
    }
    await this.sessions.save(session);
    return Result.success(toSummary(session));
  }
}

export function toSummary(session: PickSession): PickSessionSummary {
  return {
    id: session.id.toString(),
    clientName: session.clientName,
    status: session.status,
    pickLimit: session.pickLimit ?? null,
    passwordProtected: Boolean(session.passwordHash),
    stage: session.stage,
    shortlistedCount: session.shortlistedPhotoIds.length,
    pickedCount: session.pickedPhotoIds.length,
    pickedPhotoIds: [...session.pickedPhotoIds],
    submittedAt: session.submittedAt?.toISOString() ?? null,
    lastSentTo: session.lastSentTo ?? null,
    lastSentAt: session.lastSentAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}
