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

export interface GenerateAlbumCommand {
  projectId: string;
  title?: string;
  targetSpreads?: number | undefined;
  format?: AlbumFormat;
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

    const candidates = await this.analysed.listForProject(command.projectId);
    if (candidates.length === 0) {
      return Result.failure(
        new ValidationError(
          "No analysed photos yet — upload and let analysis finish before generating an album.",
        ),
      );
    }

    const spreads = planAlbum(candidates, { targetSpreads: command.targetSpreads });
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
