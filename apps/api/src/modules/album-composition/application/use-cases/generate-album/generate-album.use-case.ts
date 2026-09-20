import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type ApplicationError,
} from "../../../../../shared-kernel/errors";
import { Album, type AlbumFormat } from "../../../domain/album";
import type { AlbumRepository } from "../../../domain/album-repository";
import { planAlbum } from "../../../domain/layout-planner";
import type {
  AlbumQuotaPolicy,
  AnalysedPhotoDirectory,
  ProjectDirectory,
} from "../../ports/directories";

const PHOTOS_PER_SPREAD = 3;

export interface GenerateAlbumCommand {
  projectId: string;
  title?: string;
  targetSpreads?: number | undefined;
  format?: AlbumFormat;
  /**
   * Build the album from exactly these photos — a client's picks. They chose them
   * on purpose, so none is dropped for a low score or as a near-duplicate.
   */
  photoIds?: string[] | undefined;
}

export class GenerateAlbumUseCase {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly projects: ProjectDirectory,
    private readonly analysed: AnalysedPhotoDirectory,
    private readonly quota: AlbumQuotaPolicy,
  ) {}

  async execute(command: GenerateAlbumCommand): Promise<Result<Album, ApplicationError>> {
    const project = await this.projects.findProject(command.projectId);
    if (!project) return Result.failure(new NotFoundError("Project", command.projectId));

    const decision = await this.quota.ensureCanCreateAlbum(project.studioId);
    if (!decision.allowed) {
      return Result.failure(new ConflictError(decision.reason ?? "Album quota reached."));
    }

    const wanted = command.photoIds ? new Set(command.photoIds) : undefined;
    const candidates = (await this.analysed.listForProject(command.projectId)).filter(
      (candidate) => !wanted || wanted.has(candidate.photoId),
    );
    if (candidates.length === 0) {
      return Result.failure(
        new ValidationError(
          wanted
            ? "None of the chosen photos has finished analysis yet — try again in a moment."
            : "No analysed photos yet — upload and let analysis finish before generating an album.",
        ),
      );
    }

    // With explicit picks, size the album so every one of them fits.
    const spreads = wanted
      ? planAlbum(candidates, {
          minScore: 0,
          targetSpreads: Math.max(command.targetSpreads ?? 0, Math.ceil(candidates.length / PHOTOS_PER_SPREAD)),
        })
      : planAlbum(candidates, { targetSpreads: command.targetSpreads });
    if (spreads.length === 0) {
      return Result.failure(
        new ValidationError(
          "No photo cleared the quality bar. Lower the threshold or upload stronger selects.",
        ),
      );
    }

    const album = Album.create({
      projectId: UniqueEntityId.create(command.projectId),
      title: command.title ?? `${project.name} — Album`,
      spreads,
      ...(command.format ? { format: command.format } : {}),
    });

    await this.albums.save(album);
    await this.quota.recordAlbumCreated(project.studioId);

    return Result.success(album);
  }
}
