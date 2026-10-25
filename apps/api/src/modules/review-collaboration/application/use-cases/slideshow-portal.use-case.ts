import type { ClientBrandingDTO } from "@albumflow/contracts";
import { Result } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, type ApplicationError } from "#src/shared-kernel/errors";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";
import { hashToken } from "../../domain/review-session";
import {
  SlideshowUnavailableError,
  type SlideshowSession,
  type SlideshowSettings,
} from "../../domain/slideshow-session";
import type { SlideshowSessionRepository } from "../../domain/slideshow-session-repository";
import type { PickGateway, PickablePhoto } from "../ports/pick-gateway";
import type { SlideshowPhotoSource } from "../ports/slideshow-photo-source";

export interface SlideshowView {
  clientName: string;
  projectName: string;
  branding: ClientBrandingDTO | null;
  settings: SlideshowSettings;
  /** Display copies in play order — never the originals. Their URLs expire, so a long-running page refetches. */
  photos: PickablePhoto[];
  expiresAt: string;
}

/**
 * The client's side of a slideshow. Scoped by the share token alone — no password, on
 * purpose: the link is meant to be forwarded to family, and the token is the boundary.
 *
 * The plan is checked when a link is made, never here: a studio that moves to a smaller
 * plan does not break slideshows its clients already have, the same as download links.
 */
export class SlideshowPortalUseCase {
  constructor(
    private readonly sessions: SlideshowSessionRepository,
    private readonly photos: SlideshowPhotoSource,
    private readonly projects: Pick<PickGateway, "loadProject">,
    private readonly logger: Logger = consoleLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async view(token: string): Promise<Result<SlideshowView, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();
    const projectId = session.projectId.toString();

    const [project, photos] = await Promise.all([
      this.projects.loadProject(projectId),
      this.photos.slides(projectId, session.photoIds),
    ]);
    if (!project) return Result.failure(new NotFoundError("Project", projectId));

    return Result.success({
      clientName: session.clientName,
      projectName: project.name,
      branding: project.branding ?? null,
      settings: session.settings,
      photos,
      expiresAt: session.expiresAt.toISOString(),
    });
  }

  /**
   * Counted once per opening of the page (the page calls this once), not per refetch.
   * Bookkeeping only: a failure here must never stop the slideshow, so it is logged and swallowed.
   */
  async recordView(token: string): Promise<Result<void, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();
    try {
      await this.sessions.recordView(session.id, this.now());
    } catch (error) {
      this.logger.warn("could not record a slideshow view", { sessionId: session.id.toString(), err: error });
    }
    return Result.success(undefined);
  }

  private async resolve(token: string): Promise<Result<SlideshowSession, ApplicationError>> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session) return Result.failure(new NotFoundError("Slideshow link", "token"));
    try {
      session.assertViewable(this.now());
    } catch (error) {
      if (error instanceof SlideshowUnavailableError) return Result.failure(new ConflictError(error.message));
      throw error;
    }
    return Result.success(session);
  }
}
