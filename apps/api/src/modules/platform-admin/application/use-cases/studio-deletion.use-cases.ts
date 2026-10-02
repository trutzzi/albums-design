import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, type ApplicationError } from "#src/shared-kernel/errors";
import type {
  StudioMemberRepository,
  StudioRepository,
  SubscriptionRepository,
} from "#src/modules/identity/domain/repositories";
import type { ProjectRepository } from "#src/modules/media-ingestion/domain/project-repository";
import type { FeedbackRepository } from "../../domain/feedback";
import type { AdminAccess } from "./admin.use-cases";

/** Deletes one shoot with everything in it — photos, albums, exports, client links. */
export interface ShootDeleter {
  execute(command: { projectId: string }): Promise<Result<void, ApplicationError>>;
}

/**
 * Removes a studio and everything it owns: its shoots (through the same deletion the
 * studio itself uses, so stored photos and exports go too), feedback, members,
 * subscription and finally the studio row. Children first, so a failure part-way leaves
 * a studio that can simply be deleted again.
 */
export class DeleteStudioUseCase {
  constructor(
    private readonly studios: StudioRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly members: StudioMemberRepository,
    private readonly projects: ProjectRepository,
    private readonly shoots: ShootDeleter,
    private readonly feedback: FeedbackRepository,
    private readonly access?: AdminAccess,
  ) {}

  async execute(studioId: string): Promise<Result<{ shootsDeleted: number }, ApplicationError>> {
    const id = UniqueEntityId.create(studioId);
    const studio = await this.studios.findById(id);
    if (!studio) return Result.failure(new NotFoundError("Studio", studioId));

    const members = await this.members.listByStudioId(id);
    const adminEmails = new Set(this.access?.adminEmails ?? []);
    if (members.some((member) => adminEmails.has(member.email.toLowerCase()))) {
      // The one mistake this button must never allow: deleting the admin's own studio.
      return Result.failure(new ConflictError("This studio belongs to an AlbumFlow admin and cannot be deleted here."));
    }

    const shoots = await this.projects.listByStudioId(id);
    for (const shoot of shoots) {
      const deleted = await this.shoots.execute({ projectId: shoot.id.toString() });
      if (deleted.isFailure) return Result.failure(deleted.getError());
    }
    await this.feedback.deleteByStudioId(studioId);
    for (const member of members) await this.members.remove(member.id);
    await this.subscriptions.deleteByStudioId(id);
    await this.studios.delete(id);
    return Result.success({ shootsDeleted: shoots.length });
  }
}

/** An unconfirmed signup older than this was never going to be confirmed. */
export const UNCONFIRMED_TTL_MS = 48 * 60 * 60 * 1000;
const BATCH = 500;

/**
 * The hourly sweep for signups nobody confirmed: bots, typos, people who changed their
 * mind. Only a studio that is exactly that one unconfirmed person and has made nothing
 * is removed — anything with a shoot or a second member is left for a human to decide.
 */
export class PurgeUnconfirmedSignupsUseCase {
  constructor(
    private readonly members: StudioMemberRepository,
    private readonly projects: ProjectRepository,
    private readonly deleteStudio: DeleteStudioUseCase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<{ deleted: number; kept: number }> {
    const cutoff = new Date(this.now().getTime() - UNCONFIRMED_TTL_MS);
    let deleted = 0;
    let kept = 0;
    // Batches, so a backlog of thousands never loads at once; stops when a batch makes no progress.
    for (;;) {
      const stale = await this.members.findUnconfirmedSignupsBefore(cutoff, BATCH);
      let progressed = false;
      for (const member of stale) {
        const [members, shoots] = await Promise.all([
          this.members.listByStudioId(member.studioId),
          this.projects.listByStudioId(member.studioId),
        ]);
        if (members.length !== 1 || shoots.length > 0) {
          kept += 1;
          continue;
        }
        const result = await this.deleteStudio.execute(member.studioId.toString());
        if (result.isSuccess) {
          deleted += 1;
          progressed = true;
        } else {
          kept += 1;
        }
      }
      if (stale.length < BATCH || !progressed) break;
    }
    return { deleted, kept };
  }
}
