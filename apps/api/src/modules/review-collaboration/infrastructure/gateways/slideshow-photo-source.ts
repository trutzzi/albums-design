import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "#src/modules/album-composition/domain/album-repository";
import type { PhotoRepository } from "#src/modules/media-ingestion/domain/photo-repository";
import type { ListProjectPhotosUseCase } from "#src/modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { compareFileNames } from "#src/shared-kernel/natural-order";
import type { PhotoDimensionsDirectory } from "#src/shared-kernel/photo-dimensions";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import type { PickablePhoto } from "../../application/ports/pick-gateway";
import type { SlideshowPhotoSource } from "../../application/ports/slideshow-photo-source";

/**
 * Slideshow photos from the three places a photographer can choose. Choosing which
 * photos only reads rows; URLs are signed in `slides`, for the saved photos alone —
 * a 60-photo slideshow of a 2,000-photo shoot signs 60, not 2,000. Only photos with
 * real display copies are ever offered, so an original's URL cannot reach a client.
 */
export class ReviewCollaborationSlideshowPhotos implements SlideshowPhotoSource {
  constructor(
    private readonly pickSessions: PickSessionRepository,
    private readonly albums: AlbumRepository,
    private readonly photos: PhotoRepository,
    private readonly views: Pick<ListProjectPhotosUseCase, "displayCopies">,
    private readonly dimensions?: PhotoDimensionsDirectory,
  ) {}

  async submittedPicks(projectId: string): Promise<string[] | undefined> {
    const sessions = await this.pickSessions.findByProjectId(UniqueEntityId.create(projectId));
    const latest = sessions
      .filter((session) => session.status === "SUBMITTED" && session.submittedAt)
      .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime())[0];
    if (!latest) return undefined;
    // Picks are stored in tap order, which is arbitrary; shoot order tells the day as it happened.
    const picked = new Set(latest.pickedPhotoIds);
    return (await this.shootPhotos(projectId)).filter((id) => picked.has(id));
  }

  async albumPhotos(projectId: string, albumId: string): Promise<string[] | undefined> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    // The album id comes from the request body, which tenancy does not check — this does.
    if (!album || album.projectId.toString() !== projectId) return undefined;
    const ids = [
      ...(album.cover?.photoId ? [album.cover.photoId] : []),
      ...album.spreads.flatMap((spread) => spread.placements.map((placement) => placement.photoId)),
    ].filter(Boolean);
    // The cover photo is often on a spread too; showing it twice in a row reads as a glitch.
    return [...new Set(ids)];
  }

  /** The same file-name order as the photographer's gallery. */
  async shootPhotos(projectId: string): Promise<string[]> {
    const photos = await this.photos.findByProjectId(UniqueEntityId.create(projectId));
    return photos
      .filter((photo) => photo.hasDerivatives)
      .map((photo) => ({ fileName: photo.fileName, id: photo.id.toString() }))
      .sort(compareFileNames)
      .map((photo) => photo.id);
  }

  async slides(projectId: string, photoIds: readonly string[]): Promise<PickablePhoto[]> {
    const [views, sizes] = await Promise.all([
      this.views.displayCopies(projectId, photoIds),
      this.dimensions?.forProject(projectId),
    ]);
    return views
      .filter((view) => view.previewUrl && view.thumbnailUrl)
      .map((view) => ({
        id: view.id,
        fileName: view.fileName,
        previewUrl: view.previewUrl!,
        thumbnailUrl: view.thumbnailUrl!,
        width: sizes?.get(view.id)?.width ?? null,
        height: sizes?.get(view.id)?.height ?? null,
      }));
  }
}
