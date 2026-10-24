import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "#src/modules/album-composition/domain/album-repository";
import type { PickSessionRepository } from "../../domain/pick-session-repository";
import type { PickGateway } from "../../application/ports/pick-gateway";
import type { SlideshowPhotoSource } from "../../application/ports/slideshow-photo-source";

/**
 * Slideshow photos from the three places a photographer can choose. Everything goes
 * through the pick gallery's listing, which only offers photos with real display
 * copies — so an original's URL can never reach a slideshow either.
 */
export class ReviewCollaborationSlideshowPhotos implements SlideshowPhotoSource {
  constructor(
    private readonly pickSessions: PickSessionRepository,
    private readonly albums: AlbumRepository,
    private readonly gallery: Pick<PickGateway, "listPhotos">,
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

  async shootPhotos(projectId: string): Promise<string[]> {
    return (await this.gallery.listPhotos(projectId)).map((photo) => photo.id);
  }

  async slides(projectId: string, photoIds: readonly string[]) {
    const byId = new Map((await this.gallery.listPhotos(projectId)).map((photo) => [photo.id, photo]));
    return photoIds.flatMap((id) => {
      const photo = byId.get(id);
      return photo ? [photo] : [];
    });
  }
}
