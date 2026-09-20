import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, type ApplicationError } from "../../../../shared-kernel/errors";
import { DownloadSession } from "../../domain/download-session";
import type { DownloadSessionRepository } from "../../domain/download-session-repository";
import type { DeliveryGateway } from "../ports/delivery-gateway";
import type { ClientAccessService } from "../services/client-access.service";

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
  ) {}

  async open(command: {
    projectId: string;
    clientName: string;
    ttlDays?: number | undefined;
  }): Promise<
    Result<
      {
        sessionId: string;
        token: string;
        expiresAt: string;
        photoCount: number;
        missingCount: number;
        password?: string;
      },
      ApplicationError
    >
  > {
    if (!(await this.delivery.loadProject(command.projectId))) {
      return Result.failure(new NotFoundError("Project", command.projectId));
    }
    const { session, token } = DownloadSession.open({
      projectId: UniqueEntityId.create(command.projectId),
      clientName: command.clientName,
      ...(command.ttlDays ? { ttlDays: command.ttlDays } : {}),
    });
    const issued = this.access ? await this.access.issue(token) : undefined;
    if (issued) session.protectWith(issued);
    await this.sessions.save(session);

    const { available, missing } = await this.delivery.listDeliverable(command.projectId);
    return Result.success({
      sessionId: session.id.toString(),
      token,
      expiresAt: session.expiresAt.toISOString(),
      photoCount: available.length,
      missingCount: missing,
      ...(issued ? { password: issued.password } : {}),
    });
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
      expiresAt: session.expiresAt.toISOString(),
      daysLeft: session.daysLeft(now),
      createdAt: session.createdAt.toISOString(),
    };
  }
}
