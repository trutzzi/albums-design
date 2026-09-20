import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import { PickClosedError, PickSession, type PickStatus } from "../../domain/pick-session";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import type { PickStage } from "../../domain/pick-session";
import type { PickGateway } from "../ports/pick-gateway";
import type { ClientAccessService } from "../services/client-access.service";

export interface OpenPickSessionCommand {
  projectId: string;
  clientName: string;
  pickLimit?: number | undefined;
  ttlDays?: number | undefined;
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
  expiresAt: string;
  createdAt: string;
}

/** The photographer's side of client selection: create a link, watch it, reopen or close it. */
export class PickSessionAdminUseCase {
  constructor(
    private readonly sessions: PickSessionRepository,
    private readonly gateway: PickGateway,
    private readonly access?: ClientAccessService,
  ) {}

  async open(
    command: OpenPickSessionCommand,
  ): Promise<
    Result<{ sessionId: string; token: string; expiresAt: string; password?: string }, ApplicationError>
  > {
    const project = await this.gateway.loadProject(command.projectId);
    if (!project) return Result.failure(new NotFoundError("Project", command.projectId));

    const { session, token } = PickSession.open({
      projectId: UniqueEntityId.create(command.projectId),
      clientName: command.clientName,
      ...(command.pickLimit ? { pickLimit: command.pickLimit } : {}),
      ...(command.ttlDays ? { ttlDays: command.ttlDays } : {}),
    });
    const issued = this.access ? await this.access.issue(token) : undefined;
    if (issued) session.protectWith(issued);
    await this.sessions.save(session);
    return Result.success({
      sessionId: session.id.toString(),
      token,
      expiresAt: session.expiresAt.toISOString(),
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
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}
