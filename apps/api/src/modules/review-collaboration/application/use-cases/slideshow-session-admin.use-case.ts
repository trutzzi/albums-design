import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, ValidationError, type ApplicationError } from "#src/shared-kernel/errors";
import type { PlanFeatureDirectory } from "#src/shared-kernel/plan-features";
import type { SecretBox } from "#src/shared-kernel/secret-box";
import {
  InvalidSlideshowSettingsError,
  SlideshowSession,
  SlideshowUnavailableError,
  type SlideshowSettings,
  type SlideshowSource,
  type SlideshowTransition,
} from "../../domain/slideshow-session";
import type { SlideshowSessionRepository } from "../../domain/slideshow-session-repository";
import type { PickGateway } from "../ports/pick-gateway";
import type { SlideshowPhotoSource } from "../ports/slideshow-photo-source";
import type { ClientContactDirectory } from "../ports/client-contact";
import type { ClientLinkInvitations } from "../services/client-link-invitations";
import type { InvitationLanguage } from "../services/client-invitation.mailer";

export interface SlideshowSessionSummary {
  id: string;
  clientName: string;
  /** EXPIRED is derived from the clock; it is never stored. */
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  source: SlideshowSource;
  albumId: string | null;
  photoCount: number;
  intervalSeconds: number;
  transition: SlideshowTransition;
  viewCount: number;
  lastViewedAt: string | null;
  lastSentTo: string | null;
  lastSentAt: string | null;
  expiresAt: string;
  daysLeft: number;
  createdAt: string;
}

export interface OpenSlideshowCommand {
  projectId: string;
  clientName: string;
  source: SlideshowSource;
  albumId?: string | undefined;
  ttlDays?: number | undefined;
  intervalSeconds?: number | undefined;
  transition?: SlideshowTransition | undefined;
  clientEmail?: string | undefined;
  sendEmail?: boolean | undefined;
  language?: InvitationLanguage | undefined;
}

/** The photographer's side of slideshows: make a link from picks, an album or the whole shoot, watch it, close it. */
export class SlideshowSessionAdminUseCase {
  constructor(
    private readonly sessions: SlideshowSessionRepository,
    private readonly photos: SlideshowPhotoSource,
    private readonly projects: Pick<PickGateway, "loadProject">,
    private readonly secrets: Pick<SecretBox, "seal" | "open">,
    private readonly now: () => Date = () => new Date(),
    private readonly invitations?: ClientLinkInvitations,
    private readonly contacts?: ClientContactDirectory,
    private readonly planFeatures?: PlanFeatureDirectory,
  ) {}

  async open(command: OpenSlideshowCommand): Promise<
    Result<
      {
        sessionId: string;
        token: string;
        expiresAt: string;
        photoCount: number;
        emailSentTo?: string;
        emailError?: string;
      },
      ApplicationError
    >
  > {
    const project = await this.projects.loadProject(command.projectId);
    if (!project) return Result.failure(new NotFoundError("Project", command.projectId));
    const features = await this.planFeatures?.forProject(command.projectId);
    if (features && !features.clientSlideshows) {
      return Result.failure(
        new ConflictError("Client slideshows come with the Studio plan. Contact us to move to Studio."),
      );
    }

    const photoIds = await this.resolvePhotos(command.projectId, command.source, command.albumId);
    if (photoIds.isFailure) return Result.failure(photoIds.getError());

    const known = await this.contacts?.forProject(command.projectId);
    const clientName = command.clientName.trim() || known?.name || "Client";
    const to = command.clientEmail?.trim() || known?.email;

    let opened: { session: SlideshowSession; token: string };
    try {
      opened = SlideshowSession.open({
        projectId: UniqueEntityId.create(command.projectId),
        clientName,
        source: command.source,
        albumId: command.albumId,
        photoIds: photoIds.getValue(),
        settings: settingsFrom(command),
        ttlDays: command.ttlDays,
      });
    } catch (error) {
      if (error instanceof InvalidSlideshowSettingsError) return Result.failure(new ValidationError(error.message));
      throw error;
    }
    const { session, token } = opened;
    session.sealToken(this.secrets.seal(token));
    await this.sessions.save(session);

    const invited =
      command.sendEmail && to && this.invitations
        ? await this.invitations.invite({
            kind: "slideshow",
            projectId: command.projectId,
            projectName: project.name,
            token,
            password: undefined,
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
      photoCount: session.photoIds.length,
      ...(invited?.sentTo ? { emailSentTo: invited.sentTo } : {}),
      ...(invited?.error ? { emailError: invited.error } : {}),
    });
  }

  async list(projectId: string): Promise<SlideshowSessionSummary[]> {
    const sessions = await this.sessions.findByProjectId(UniqueEntityId.create(projectId));
    return sessions.map((session) => this.toSummary(session)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** The link, readable again by the studio. */
  async reveal(projectId: string, sessionId: string): Promise<Result<{ token: string }, ApplicationError>> {
    const found = await this.find(projectId, sessionId);
    if (found.isFailure) return Result.failure(found.getError());
    const token = this.tokenOf(found.getValue());
    if (!token) return Result.failure(unreadableLink());
    return Result.success({ token });
  }

  /** Emails an existing slideshow link — a resend, or to someone new. */
  async sendInvitation(
    projectId: string,
    sessionId: string,
    options: { email?: string | undefined; language?: InvitationLanguage | undefined } = {},
  ): Promise<Result<SlideshowSessionSummary, ApplicationError>> {
    const found = await this.find(projectId, sessionId);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();
    if (!this.invitations) return Result.failure(new ConflictError("Email is not configured on this server."));

    const known = await this.contacts?.forProject(projectId);
    const to = options.email?.trim() || session.lastSentTo || known?.email;
    if (!to) return Result.failure(new ValidationError("Enter the client's email address."));
    const token = this.tokenOf(session);
    if (!token) return Result.failure(unreadableLink());

    const project = await this.projects.loadProject(projectId);
    const invited = await this.invitations.invite({
      kind: "slideshow",
      projectId,
      projectName: project?.name ?? known?.projectName ?? "",
      token,
      password: undefined,
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

  /** Re-take the photo list from the same source, e.g. after the album was re-laid out. */
  async refresh(projectId: string, sessionId: string): Promise<Result<SlideshowSessionSummary, ApplicationError>> {
    const found = await this.find(projectId, sessionId);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();
    if (session.status === "REVOKED") return Result.failure(new ConflictError("This slideshow link was revoked."));
    const photoIds = await this.resolvePhotos(projectId, session.source, session.albumId);
    if (photoIds.isFailure) return Result.failure(photoIds.getError());
    session.replacePhotos(photoIds.getValue());
    await this.sessions.save(session);
    return Result.success(this.toSummary(session));
  }

  async updateSettings(
    projectId: string,
    sessionId: string,
    changes: Partial<SlideshowSettings>,
  ): Promise<Result<SlideshowSessionSummary, ApplicationError>> {
    const found = await this.find(projectId, sessionId);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();
    try {
      session.updateSettings(changes);
    } catch (error) {
      if (error instanceof InvalidSlideshowSettingsError) return Result.failure(new ValidationError(error.message));
      throw error;
    }
    await this.sessions.save(session);
    return Result.success(this.toSummary(session));
  }

  /** A keepsake outlives its first expiry date: extend rather than make a new link and break the old one. */
  async extend(
    projectId: string,
    sessionId: string,
    days?: number | undefined,
  ): Promise<Result<SlideshowSessionSummary, ApplicationError>> {
    const found = await this.find(projectId, sessionId);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();
    try {
      session.extend(days, this.now());
    } catch (error) {
      if (error instanceof SlideshowUnavailableError) return Result.failure(new ConflictError(error.message));
      throw error;
    }
    await this.sessions.save(session);
    return Result.success(this.toSummary(session));
  }

  async revoke(projectId: string, sessionId: string): Promise<Result<SlideshowSessionSummary, ApplicationError>> {
    const found = await this.find(projectId, sessionId);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();
    session.revoke();
    await this.sessions.save(session);
    return Result.success(this.toSummary(session));
  }

  private async resolvePhotos(
    projectId: string,
    source: SlideshowSource,
    albumId: string | undefined,
  ): Promise<Result<string[], ApplicationError>> {
    let photoIds: string[] | undefined;
    if (source === "PICKS") {
      photoIds = await this.photos.submittedPicks(projectId);
      if (!photoIds) {
        return Result.failure(
          new ConflictError("The client has not sent their picks yet. Choose the album or the whole shoot instead."),
        );
      }
    } else if (source === "ALBUM") {
      if (!albumId) return Result.failure(new ValidationError("Choose which album the slideshow follows."));
      photoIds = await this.photos.albumPhotos(projectId, albumId);
      if (!photoIds) return Result.failure(new NotFoundError("Album", albumId));
    } else {
      photoIds = await this.photos.shootPhotos(projectId);
    }
    if (photoIds.length === 0) return Result.failure(new ConflictError("There are no photos to show yet."));
    return Result.success(photoIds);
  }

  /** The project in the path is what tenancy verified; the link must belong to it. */
  private async find(projectId: string, sessionId: string): Promise<Result<SlideshowSession, ApplicationError>> {
    const session = await this.sessions.findById(UniqueEntityId.create(sessionId));
    if (!session || session.projectId.toString() !== projectId) {
      return Result.failure(new NotFoundError("Slideshow link", sessionId));
    }
    return Result.success(session);
  }

  private tokenOf(session: SlideshowSession): string | undefined {
    return session.sealedSecret ? this.secrets.open(session.sealedSecret) : undefined;
  }

  private toSummary(session: SlideshowSession): SlideshowSessionSummary {
    const now = this.now();
    return {
      id: session.id.toString(),
      clientName: session.clientName,
      status: session.status === "REVOKED" ? "REVOKED" : session.isExpired(now) ? "EXPIRED" : "ACTIVE",
      source: session.source,
      albumId: session.albumId ?? null,
      photoCount: session.photoIds.length,
      intervalSeconds: session.settings.intervalSeconds,
      transition: session.settings.transition,
      viewCount: session.viewCount,
      lastViewedAt: session.lastViewedAt?.toISOString() ?? null,
      lastSentTo: session.lastSentTo ?? null,
      lastSentAt: session.lastSentAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
      daysLeft: session.daysLeft(now),
      createdAt: session.createdAt.toISOString(),
    };
  }
}

function settingsFrom(command: OpenSlideshowCommand): Partial<SlideshowSettings> {
  return {
    ...(command.intervalSeconds !== undefined ? { intervalSeconds: command.intervalSeconds } : {}),
    ...(command.transition ? { transition: command.transition } : {}),
  };
}

/** Only when the server's secret was rotated since the link was made. */
function unreadableLink(): ConflictError {
  return new ConflictError("This link can no longer be shown. Create a new slideshow link.");
}
