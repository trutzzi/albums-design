import { Result } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import {
  PickClosedError,
  PickExpiredError,
  PickLimitError,
  type PickSession,
} from "../../domain/pick-session";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import { hashToken } from "../../domain/review-session";
import type { PickGateway, PickNotifier, PickablePhoto } from "../ports/pick-gateway";
import type { ClientAccessService } from "../services/client-access.service";

export interface PickState {
  id: string;
  clientName: string;
  status: string;
  pickLimit: number | null;
  pickedPhotoIds: string[];
  expiresAt: string;
}

export interface PickView {
  session: PickState;
  projectName: string;
  photos: PickablePhoto[];
}

/**
 * Every client-facing operation is scoped by the share token — like the album
 * review portal, there is no other authentication, so the token is the boundary.
 */
export class PickPortalUseCase {
  constructor(
    private readonly sessions: PickSessionRepository,
    private readonly gateway: PickGateway,
    private readonly notifier: PickNotifier,
    private readonly access?: ClientAccessService,
  ) {}

  /** Every client route calls this first: a protected link answers PASSWORD_REQUIRED until unlocked. */
  async authorize(token: string, grant: string | undefined): Promise<Result<void, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    return this.access ? this.access.authorize("pick", found.getValue(), grant) : Result.success(undefined);
  }

  async unlock(token: string, password: string): Promise<Result<{ grant: string }, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    if (!this.access) return Result.failure(new NotFoundError("Selection link", "token"));
    const granted = await this.access.unlock("pick", found.getValue(), password);
    return granted.isFailure ? Result.failure(granted.getError()) : Result.success({ grant: granted.getValue() });
  }

  async view(token: string): Promise<Result<PickView, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();

    const project = await this.gateway.loadProject(session.projectId.toString());
    if (!project) return Result.failure(new NotFoundError("Project", session.projectId.toString()));

    const photos = await this.gateway.listPhotos(project.id);
    // A photo deleted after being picked must not linger as a phantom pick.
    const present = new Set(photos.map((photo) => photo.id));
    const picked = session.pickedPhotoIds.filter((id) => present.has(id));
    return Result.success({
      session: { ...toState(session), pickedPhotoIds: picked },
      projectName: project.name,
      photos,
    });
  }

  async setPick(
    token: string,
    photoId: string,
    picked: boolean,
  ): Promise<Result<PickState, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();

    if (picked && !(await this.gateway.hasPhoto(session.projectId.toString(), photoId))) {
      return Result.failure(new NotFoundError("Photo", photoId));
    }
    try {
      session.setPick(photoId, picked);
    } catch (error) {
      return Result.failure(toApplicationError(error));
    }
    await this.sessions.save(session);
    return Result.success(toState(session));
  }

  async submit(token: string): Promise<Result<PickState, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();

    // Drop picks whose photo has since been deleted, so the count the photographer
    // sees — and the set that gets stored long-term — is only real photos.
    const photos = await this.gateway.listPhotos(session.projectId.toString());
    const present = new Set(photos.map((photo) => photo.id));
    try {
      for (const id of [...session.pickedPhotoIds]) if (!present.has(id)) session.setPick(id, false);
      session.submit();
    } catch (error) {
      return Result.failure(toApplicationError(error));
    }
    await this.sessions.save(session);

    await this.notifier.picksSubmitted({
      projectId: session.projectId.toString(),
      sessionId: session.id.toString(),
      clientName: session.clientName,
      photoIds: [...session.pickedPhotoIds],
    });
    return Result.success(toState(session));
  }

  private async resolve(token: string): Promise<Result<PickSession, ApplicationError>> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session) return Result.failure(new NotFoundError("Selection link", "token"));
    if (session.status === "REVOKED") {
      return Result.failure(new ConflictError("This selection link is no longer active."));
    }
    return Result.success(session);
  }
}

function toState(session: PickSession): PickState {
  return {
    id: session.id.toString(),
    clientName: session.clientName,
    status: session.status,
    pickLimit: session.pickLimit ?? null,
    pickedPhotoIds: [...session.pickedPhotoIds],
    expiresAt: session.expiresAt.toISOString(),
  };
}

function toApplicationError(error: unknown): ApplicationError {
  if (error instanceof PickClosedError || error instanceof PickExpiredError || error instanceof PickLimitError) {
    return new ConflictError(error.message);
  }
  if (error instanceof Error) return new ValidationError(error.message);
  return new ValidationError("Selection action failed.");
}
