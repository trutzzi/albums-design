import { withOverride, type ClientBrandingDTO } from "@albumflow/contracts";
import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, type ApplicationError } from "#src/shared-kernel/errors";
import { DownloadUnavailableError, type DownloadSession } from "../../domain/download-session";
import type { DownloadSessionRepository } from "../../domain/download-session-repository";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import { chooseCover, storySections } from "../../domain/client-gallery";
import { hashToken } from "../../domain/review-session";
import type { DeliverablePhoto, DeliveryGateway, DownloadNotifier } from "../ports/delivery-gateway";
import type { CoverThumbnails, TeaserImages } from "../ports/cover-teaser";
import type { PickGateway, PickablePhoto } from "../ports/pick-gateway";
import type { ClientAccessService } from "../services/client-access.service";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";
import type { PhotoTraits, PhotoTraitsDirectory } from "#src/shared-kernel/photo-traits";

export interface GateInfo {
  studioName: string | null;
  accent: string | null;
  /** Whether `/teaser.jpg` can be shown behind the form. */
  teaser: boolean;
}

export interface DownloadView {
  clientName: string;
  projectName: string;
  photoCount: number;
  /** Originals that no longer exist anywhere (past the retention window) and so are not in the download. */
  missingCount: number;
  totalBytes: number;
  expiresAt: string;
  daysLeft: number;
  branding: ClientBrandingDTO | null;
  /**
   * Display copies to browse before downloading — never the originals. `byteSize` is the
   * full-size original's, so the page can say how big each download is; `null` for a photo
   * whose original is no longer stored (it is not in any download).
   */
  photos: (PickablePhoto & { section: string | null; byteSize: number | null })[];
  /** The chapters the gallery is split into, in the order of the day (photo categories, e.g. `CEREMONY`). */
  sections: string[];
  coverPhotoId: string | null;
  /** The photos the client picked in the selection step, offered again as their favourites. */
  favoritePhotoIds: string[];
  eventDate: string | null;
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

/** Which photos go into the ZIP: all of them, the client's favourites, or one chapter. */
export type DownloadScope = { kind: "all" } | { kind: "favorites" } | { kind: "section"; section: string };

/**
 * Every client-facing operation is scoped by the share token — like the review
 * and pick portals there is no other authentication, so the token is the boundary.
 */
/** A teaser stays the same for a while; serving it from memory spares the listing and the resize. */
const TEASER_CACHE_MS = 60 * 60 * 1000;
const TEASER_CACHE_MAX = 200;

export class DownloadPortalUseCase {
  private readonly teasers = new Map<string, { at: number; image: Buffer }>();

  constructor(
    private readonly sessions: DownloadSessionRepository,
    private readonly delivery: DeliveryGateway,
    private readonly notifier: DownloadNotifier,
    private readonly logger: Logger = consoleLogger,
    private readonly now: () => Date = () => new Date(),
    private readonly access?: ClientAccessService,
    /** Where the browsable display copies come from. Without it the page shows no gallery. */
    private readonly gallery?: Pick<PickGateway, "listPhotos" | "countProcessing">,
    private readonly arrangement: {
      /** Chapters and the automatic cover. Without it the gallery is one undivided grid. */
      traits?: PhotoTraitsDirectory | undefined;
      /** Where the client's earlier picks come from. Without it there are no favourites. */
      picks?: Pick<PickSessionRepository, "findByProjectId"> | undefined;
      /** The blurred cover behind the password gate. Without it the gate shows no photo. */
      teaser?: { source: CoverThumbnails; images: TeaserImages } | undefined;
    } = {},
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

  /**
   * What the password gate may show before the password: the studio's name and colour, and
   * whether there is a cover teaser. Never the shoot's name or anything from its photos.
   */
  async gate(token: string): Promise<Result<GateInfo, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const project = await this.delivery.loadProject(found.getValue().projectId.toString());
    if (!project) return Result.failure(new NotFoundError("Download link", "token"));
    return Result.success({
      studioName: project.branding?.name ?? null,
      accent: project.branding?.accent ?? null,
      teaser: Boolean(this.arrangement.teaser),
    });
  }

  /**
   * The gallery's cover shrunk to a few dozen pixels, for the gate to blur behind its form.
   * Shown before the password by the owner's choice; the size keeps it a mood, not a photo.
   */
  async teaser(token: string): Promise<Result<Buffer, ApplicationError>> {
    const teaser = this.arrangement.teaser;
    if (!teaser) return Result.failure(new NotFoundError("Cover", "teaser"));
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();
    // A newly chosen cover is a new key; an automatic one may lag by up to an hour, which is fine for a blur.
    const key = `${session.id.toString()}:${session.coverPhotoId ?? "auto"}`;
    const cached = this.teasers.get(key);
    if (cached && this.now().getTime() - cached.at < TEASER_CACHE_MS) return Result.success(cached.image);

    const projectId = session.projectId.toString();
    let coverId: string | null = null;
    try {
      const [listed, traits] = await Promise.all([
        this.gallery?.listPhotos(projectId) ?? [],
        this.traitsFor(projectId).then((found) => found ?? new Map<string, PhotoTraits>()),
      ]);
      coverId = chooseCover(listed, traits, session.coverPhotoId);
      const thumbnail = coverId ? await teaser.source.thumbnail(coverId) : undefined;
      if (!thumbnail) return Result.failure(new NotFoundError("Cover", "teaser"));
      const image = await teaser.images.shrink(thumbnail);
      if (this.teasers.size >= TEASER_CACHE_MAX) this.teasers.delete(this.teasers.keys().next().value!);
      this.teasers.set(key, { at: this.now().getTime(), image });
      return Result.success(image);
    } catch (error) {
      // The gate simply shows the plain lock; the photographer's gallery is unaffected.
      this.logger.warn("could not make the gallery cover teaser", {
        sessionId: session.id.toString(),
        photoId: coverId,
        err: error,
      });
      return Result.failure(new NotFoundError("Cover", "teaser"));
    }
  }

  async view(token: string): Promise<Result<DownloadView, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();

    const project = await this.delivery.loadProject(session.projectId.toString());
    if (!project) return Result.failure(new NotFoundError("Project", session.projectId.toString()));
    const [{ available, missing }, listed, processingCount, traits, favoritePhotoIds] = await Promise.all([
      this.delivery.listDeliverable(project.id),
      this.gallery?.listPhotos(project.id) ?? [],
      this.gallery?.countProcessing(project.id) ?? 0,
      this.traitsFor(project.id).then((found) => found ?? new Map<string, PhotoTraits>()),
      this.favoritesFor(project.id).then((found) => found ?? []),
    ]);
    const sizes = new Map(available.map((photo) => [photo.photoId, photo.byteSize]));
    const photos = listed.map((photo) => ({
      ...photo,
      section: traits.get(photo.id)?.category ?? null,
      byteSize: sizes.get(photo.id) ?? null,
    }));

    return Result.success({
      clientName: session.clientName,
      projectName: project.name,
      photoCount: available.length,
      missingCount: missing,
      totalBytes: available.reduce((sum, photo) => sum + photo.byteSize, 0),
      expiresAt: session.expiresAt.toISOString(),
      daysLeft: session.daysLeft(this.now()),
      photos,
      sections: storySections(photos, traits),
      coverPhotoId: chooseCover(photos, traits, session.coverPhotoId),
      favoritePhotoIds,
      eventDate: project.eventDate?.toISOString() ?? null,
      processingCount,
      // The studio's style with this gallery's own choices on top; nothing at all without Studio Pro.
      branding: project.branding
        ? { ...project.branding, style: withOverride(project.branding.style, session.lookOverride) }
        : null,
    });
  }

  async prepare(
    token: string,
    scope: DownloadScope = { kind: "all" },
  ): Promise<Result<PreparedDownload, ApplicationError>> {
    const found = await this.resolve(token);
    if (found.isFailure) return Result.failure(found.getError());
    const session = found.getValue();

    const project = await this.delivery.loadProject(session.projectId.toString());
    if (!project) return Result.failure(new NotFoundError("Project", session.projectId.toString()));
    const { available: all } = await this.delivery.listDeliverable(project.id);
    if (all.length === 0) {
      return Result.failure(new ConflictError("There are no photos available to download yet."));
    }
    const available = await this.narrow(project.id, all, scope);
    if (!available) {
      // Unlike the gallery, a part of it cannot be zipped without knowing what is in it:
      // answering "nothing here" would tell the client their photos are gone.
      this.logger.error("could not narrow a delivery download to the part the client chose", {
        sessionId: session.id.toString(),
        scope: scope.kind,
      });
      return Result.failure(
        new ConflictError("We could not prepare this part of the gallery right now. Please try again in a moment."),
      );
    }
    if (available.length === 0) {
      return Result.failure(
        new ConflictError(
          scope.kind === "favorites"
            ? "You have no favourite photos to download."
            : "There are no photos in this part of the gallery.",
        ),
      );
    }

    const names = uniqueEntryNames(available.map((photo) => photo.fileName));
    const suffix = scope.kind === "all" ? "photos" : scope.kind === "favorites" ? "favorites" : slugify(scope.section);
    return Result.success({
      fileName: `${slugify(project.name)}-${suffix}.zip`,
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
          this.logger.error("could not record or announce a finished download", {
            sessionId: session.id.toString(),
            err: error,
          });
        }
      },
    });
  }

  private async narrow(
    projectId: string,
    photos: DeliverablePhoto[],
    scope: DownloadScope,
  ): Promise<DeliverablePhoto[] | undefined> {
    if (scope.kind === "all") return photos;
    if (scope.kind === "favorites") {
      const favorites = await this.favoritesFor(projectId);
      if (!favorites) return undefined;
      const chosen = new Set(favorites);
      return photos.filter((photo) => chosen.has(photo.photoId));
    }
    const traits = await this.traitsFor(projectId);
    if (!traits) return undefined;
    return photos.filter((photo) => traits.get(photo.photoId)?.category === scope.section);
  }

  /** Each photo's category and score; `undefined` when they could not be read (logged). */
  private async traitsFor(projectId: string): Promise<Map<string, PhotoTraits> | undefined> {
    try {
      return (await this.arrangement.traits?.forProject(projectId)) ?? new Map();
    } catch (error) {
      // Chapters and the cover are a nicety; the client must still see and download their photos.
      this.logger.warn("could not read photo categories for the delivery gallery", { projectId, err: error });
      return undefined;
    }
  }

  /**
   * The most recent picks the client sent; an open, unsent selection is not yet a choice.
   * `undefined` when they could not be read (logged).
   */
  private async favoritesFor(projectId: string): Promise<string[] | undefined> {
    if (!this.arrangement.picks) return [];
    try {
      const sessions = await this.arrangement.picks.findByProjectId(UniqueEntityId.create(projectId));
      const latest = sessions
        .filter((session) => session.status === "SUBMITTED")
        .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0))[0];
      return latest ? [...latest.pickedPhotoIds] : [];
    } catch (error) {
      this.logger.warn("could not read the client's picks for the delivery gallery", { projectId, err: error });
      return undefined;
    }
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
    const name =
      raw
        .replace(/[\\/]+/g, "_")
        .replace(/^\.+/, "")
        .trim() || "photo";
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
