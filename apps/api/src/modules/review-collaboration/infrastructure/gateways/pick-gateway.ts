import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ProjectRepository } from "../../../media-ingestion/domain/project-repository";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { ListProjectPhotosUseCase } from "../../../media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import type { PickGateway, PickNotifier } from "../../application/ports/pick-gateway";

/** Anti-corruption layer over Media Ingestion: the client only ever sees display copies, never originals. */
export class MediaIngestionPickGateway implements PickGateway {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly photos: PhotoRepository,
    private readonly listPhotoViews: ListProjectPhotosUseCase,
  ) {}

  async loadProject(projectId: string) {
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    return project ? { id: project.id.toString(), name: project.name } : undefined;
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
    const views = await this.listPhotoViews.execute(projectId);
    return views
      .filter((view) => ready.has(view.id) && view.previewUrl && view.thumbnailUrl)
      .map((view) => ({
        id: view.id,
        fileName: view.fileName,
        previewUrl: view.previewUrl!,
        thumbnailUrl: view.thumbnailUrl!,
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
  constructor(private readonly log: (message: string) => void = console.log) {}

  async picksSubmitted(params: Parameters<PickNotifier["picksSubmitted"]>[0]): Promise<void> {
    this.log(`[picks] ${params.clientName} sent ${params.photoIds.length} picks for project ${params.projectId}`);
  }
}
