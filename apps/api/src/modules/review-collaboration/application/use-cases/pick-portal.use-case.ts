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
  PickStageError,
  type PickSession,
  type PickStage,
} from "../../domain/pick-session";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import { hashToken } from "../../domain/review-session";
import type { PickGateway, PickNotifier, PickablePhoto } from "../ports/pick-gateway";
import type { ClientAccessService } from "../services/client-access.service";

export interface PickState {
  id: string;
  clientName: string;
  status: string;
  /** Which of the two steps the client is on. */
  stage: PickStage;
  pickLimit: number | null;
  /** Step 1: everything they might want. */
  shortlistedPhotoIds: string[];
  /** Step 2: what they finally chose — always a subset of the shortlist. */
  pickedPhotoIds: string[];
  expiresAt: string;
}

export interface PickView {
  session: PickState;
  projectName: string;
  photos: PickablePhoto[];
  /** Photos still being prepared; the page keeps refreshing until this reaches zero. */
  processingCount: number;
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
    const processingCount = await this.gateway.countProcessing(project.id);
    // A photo deleted after being picked must not linger as a phantom pick.
    const present = new Set(photos.map((photo) => photo.id));
    const state = toState(session);
    return Result.success({
      session: {
        ...state,
        shortlistedPhotoIds: state.shortlistedPhotoIds.filter((id) => present.has(id)),
        pickedPhotoIds: state.pickedPhotoIds.filter((id) => present.has(id)),
      },
      projectName: project.name,
      photos,
      processingCount,
    });
  }

  /**
   * One tap on a photo. Which list it lands in follows the step the client is on, so the
   * page cannot put a photo in the wrong one — the shortlist in step 1, the final picks in step 2.
   */
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
      if (session.stage === "SHORTLIST") session.setShortlisted(photoId, picked);
      else session.setPick(photoId, picked);
    } catch (error) {
      return Result.failure(toApplicationError(error));
    }
    await this.sessions.save(session);
    return Result.success(toState(session));
  }

  /** Move between the two steps. */
  async setStage(token: string, stage: PickStage): Promise<Result<PickState, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();

    try {
      if (stage === "FINAL") session.goToFinal();
      else session.backToShortlist();
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
      session.forgetMissing(present);
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
    stage: session.stage,
    pickLimit: session.pickLimit ?? null,
    shortlistedPhotoIds: [...session.shortlistedPhotoIds],
    pickedPhotoIds: [...session.pickedPhotoIds],
    expiresAt: session.expiresAt.toISOString(),
  };
}

function toApplicationError(error: unknown): ApplicationError {
  if (
    error instanceof PickClosedError ||
    error instanceof PickExpiredError ||
    error instanceof PickLimitError ||
    error instanceof PickStageError
  ) {
    return new ConflictError(error.message);
  }
  if (error instanceof Error) return new ValidationError(error.message);
  return new ValidationError("Selection action failed.");
}
