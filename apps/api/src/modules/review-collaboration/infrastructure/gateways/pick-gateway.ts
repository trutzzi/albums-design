import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ProjectRepository } from "../../../media-ingestion/domain/project-repository";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { ListProjectPhotosUseCase } from "../../../media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import type { PickGateway, PickNotifier } from "../../application/ports/pick-gateway";
import type { StudioBrandingDirectory } from "../../../../shared-kernel/studio-branding";
import type { PhotoDimensionsDirectory } from "../../../../shared-kernel/photo-dimensions";
import { consoleLogger, type Logger } from "../../../../shared-kernel/logger";

/** Anti-corruption layer over Media Ingestion: the client only ever sees display copies, never originals. */
export class MediaIngestionPickGateway implements PickGateway {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly photos: PhotoRepository,
    private readonly listPhotoViews: ListProjectPhotosUseCase,
    private readonly extras: {
      branding?: StudioBrandingDirectory | undefined;
      /** Lets the client gallery show each photo at its own proportions. */
      dimensions?: PhotoDimensionsDirectory | undefined;
    } = {},
  ) {}

  async loadProject(projectId: string) {
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    if (!project) return undefined;
    return { id: project.id.toString(), name: project.name, branding: (await this.extras.branding?.forProject(projectId)) ?? null };
  }

  async listPhotos(projectId: string) {
    // The listing falls back to the original while display copies are still being
    // made — fine for the photographer, never for a client. Only photos that have
    // real display copies are offered, so an original's URL cannot reach them.
    const ready = new Set(
      (await this.photos.findByProjectId(UniqueEntityId.create(projectId)))
        .filter((photo) => photo.hasDerivatives)
        .map((photo) => photo.id.toString()),
    );
    const [views, sizes] = await Promise.all([
      this.listPhotoViews.execute(projectId),
      this.extras.dimensions?.forProject(projectId),
    ]);
    return views
      .filter((view) => ready.has(view.id) && view.previewUrl && view.thumbnailUrl)
      .map((view) => ({
        id: view.id,
        fileName: view.fileName,
        previewUrl: view.previewUrl!,
        thumbnailUrl: view.thumbnailUrl!,
        width: sizes?.get(view.id)?.width ?? null,
        height: sizes?.get(view.id)?.height ?? null,
      }));
  }

  async countProcessing(projectId: string) {
    return (await this.photos.findByProjectId(UniqueEntityId.create(projectId))).filter(
      (photo) => photo.status !== "PENDING_UPLOAD" && !photo.hasDerivatives,
    ).length;
  }

  async hasPhoto(projectId: string, photoId: string) {
    const photo = await this.photos.findById(UniqueEntityId.create(photoId));
    return photo !== undefined && photo.projectId.toString() === projectId;
  }
}

export class LoggingPickNotifier implements PickNotifier {
  constructor(private readonly logger: Logger = consoleLogger) {}

  async picksSubmitted(params: Parameters<PickNotifier["picksSubmitted"]>[0]): Promise<void> {
    this.logger.info("client sent picks", { projectId: params.projectId, picks: params.photoIds.length });
  }
}
