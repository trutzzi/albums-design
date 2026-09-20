import { Result } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import { DownloadUnavailableError, type DownloadSession } from "../../domain/download-session";
import type { DownloadSessionRepository } from "../../domain/download-session-repository";
import { hashToken } from "../../domain/review-session";
import type { DeliverablePhoto, DeliveryGateway, DownloadNotifier } from "../ports/delivery-gateway";
import type { PickGateway, PickablePhoto } from "../ports/pick-gateway";
import type { ClientAccessService } from "../services/client-access.service";

export interface DownloadView {
  clientName: string;
  projectName: string;
  photoCount: number;
  /** Originals that no longer exist anywhere (past the retention window) and so are not in the download. */
  missingCount: number;
  totalBytes: number;
  expiresAt: string;
  daysLeft: number;
  /** Display copies to browse before downloading — never the originals. */
  photos: PickablePhoto[];
  /** Photos still being prepared for the gallery; the page keeps refreshing until this reaches zero. */
  processingCount: number;
}

export interface PreparedDownload {
  /** Suggested name for the ZIP, e.g. `elena-radu-photos.zip`. */
  fileName: string;
  entries: { name: string; photo: DeliverablePhoto }[];
  /** Call once the whole file has been delivered: counts the download and tells the studio. Never throws. */
  complete(): Promise<void>;
}

/**
 * Every client-facing operation is scoped by the share token — like the review
 * and pick portals there is no other authentication, so the token is the boundary.
 */
export class DownloadPortalUseCase {
  constructor(
    private readonly sessions: DownloadSessionRepository,
    private readonly delivery: DeliveryGateway,
    private readonly notifier: DownloadNotifier,
    private readonly log: (message: string) => void = console.error,
    private readonly now: () => Date = () => new Date(),
    private readonly access?: ClientAccessService,
    /** Where the browsable display copies come from. Without it the page shows no gallery. */
    private readonly gallery?: Pick<PickGateway, "listPhotos" | "countProcessing">,
  ) {}

  /** Every client route calls this first: a protected link answers PASSWORD_REQUIRED until unlocked. */
  async authorize(token: string, grant: string | undefined): Promise<Result<void, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    return this.access ? this.access.authorize("download", found.getValue(), grant) : Result.success(undefined);
  }

  async unlock(token: string, password: string): Promise<Result<{ grant: string }, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    if (!this.access) return Result.failure(new NotFoundError("Download link", "token"));
    const granted = await this.access.unlock("download", found.getValue(), password);
    return granted.isFailure ? Result.failure(granted.getError()) : Result.success({ grant: granted.getValue() });
  }

  async view(token: string): Promise<Result<DownloadView, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();

    const project = await this.delivery.loadProject(session.projectId.toString());
    if (!project) return Result.failure(new NotFoundError("Project", session.projectId.toString()));
    const { available, missing } = await this.delivery.listDeliverable(project.id);

    return Result.success({
      clientName: session.clientName,
      projectName: project.name,
      photoCount: available.length,
      missingCount: missing,
      totalBytes: available.reduce((sum, photo) => sum + photo.byteSize, 0),
      expiresAt: session.expiresAt.toISOString(),
      daysLeft: session.daysLeft(this.now()),
      photos: (await this.gallery?.listPhotos(project.id)) ?? [],
      processingCount: (await this.gallery?.countProcessing(project.id)) ?? 0,
    });
  }

  async prepare(token: string): Promise<Result<PreparedDownload, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();

    const project = await this.delivery.loadProject(session.projectId.toString());
    if (!project) return Result.failure(new NotFoundError("Project", session.projectId.toString()));
    const { available } = await this.delivery.listDeliverable(project.id);
    if (available.length === 0) {
      return Result.failure(new ConflictError("There are no photos available to download yet."));
    }

    const names = uniqueEntryNames(available.map((photo) => photo.fileName));
    return Result.success({
      fileName: `${slugify(project.name)}-photos.zip`,
      entries: available.map((photo, index) => ({ name: names[index]!, photo })),
      complete: async () => {
        try {
          // Reload: another download may have finished while this one was streaming.
          const fresh = (await this.sessions.findById(session.id)) ?? session;
          fresh.recordDownload(this.now());
          await this.sessions.save(fresh);
          await this.notifier.photosDownloaded({
            projectId: project.id,
            sessionId: fresh.id.toString(),
            clientName: fresh.clientName,
            photoCount: available.length,
            byteSize: available.reduce((sum, photo) => sum + photo.byteSize, 0),
            downloadNumber: fresh.downloadCount,
          });
        } catch (error) {
          // The client already has their photos; a bookkeeping or mail failure must not matter to them.
          this.log(`[download] could not record/announce a finished download: ${String(error)}`);
        }
      },
    });
  }

  private async resolve(token: string): Promise<Result<DownloadSession, ApplicationError>> {
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session) return Result.failure(new NotFoundError("Download link", "token"));
    try {
      session.assertDownloadable(this.now());
    } catch (error) {
      if (error instanceof DownloadUnavailableError) return Result.failure(new ConflictError(error.message));
      throw error;
    }
    return Result.success(session);
  }
}

/** ZIP entries need distinct names; two cameras can both write IMG_0001.jpg. */
export function uniqueEntryNames(fileNames: string[]): string[] {
  const seen = new Map<string, number>();
  return fileNames.map((raw) => {
    // Never let a stored name reach into another folder inside the archive.
    const name = raw.replace(/[\\/]+/g, "_").replace(/^\.+/, "").trim() || "photo";
    const key = name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
  });
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "album";
}
