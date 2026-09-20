import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { StorageProvider } from "../../../../../shared-kernel/storage-provider";
import type { AlbumRepository } from "../../../../album-composition/domain/album-repository";
import type { Project } from "../../../domain/project";
import type { PhotoRepository } from "../../../domain/photo-repository";
import type { ProjectRepository } from "../../../domain/project-repository";
import type { ObjectStorage } from "../../ports/object-storage";

const COVER_TTL_SECONDS = 60 * 60;

export interface ProjectSummaryView {
  id: string;
  studioId: string;
  name: string;
  type: string;
  eventDate: string | null;
  clientName: string | null;
  clientEmail: string | null;
  createdAt: string;
  /** Photos that finished uploading. */
  photoCount: number;
  albumCount: number;
  /** A photo to show on the card. Null while a shoot is still empty or being processed. */
  coverThumbnailUrl: string | null;
}

/**
 * The shoots list. It carries enough for a card a photographer can recognise at a glance —
 * a cover photo, how many photos and albums it holds, who it is for — without ever loading
 * a shoot's photos: the counts come from two grouped queries, and each cover is a single
 * indexed row.
 */
export class ListStudioProjectsUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly photos: PhotoRepository,
    private readonly albums: AlbumRepository,
    private readonly storage: ObjectStorage,
    private readonly permanent?: StorageProvider,
  ) {}

  async execute(studioId: string): Promise<ProjectSummaryView[]> {
    const projects = await this.projects.listByStudioId(UniqueEntityId.create(studioId));
    if (projects.length === 0) return [];

    const ids = projects.map((project) => project.id);
    const [photoCounts, albumCounts] = await Promise.all([
      this.photos.countByProjectIds(ids),
      this.albums.countByProjectIds(ids),
    ]);
    const covers = await Promise.all(projects.map((project) => this.coverUrl(project)));

    return projects.map((project, index) => ({
      id: project.id.toString(),
      studioId: project.studioId.toString(),
      name: project.name,
      type: project.type,
      eventDate: project.eventDate?.toISOString() ?? null,
      clientName: project.clientName ?? null,
      clientEmail: project.clientEmail ?? null,
      createdAt: project.createdAt.toISOString(),
      photoCount: photoCounts[project.id.toString()] ?? 0,
      albumCount: albumCounts[project.id.toString()] ?? 0,
      coverThumbnailUrl: covers[index] ?? null,
    }));
  }

  private async coverUrl(project: Project): Promise<string | null> {
    const photo = await this.photos.findCoverPhoto(project.id);
    if (!photo) return null;
    const key = photo.storageKey.derivative("thumb").toString();
    // A cover that cannot be signed is not worth failing the whole list for.
    try {
      return photo.permanentDerivatives && this.permanent
        ? await this.permanent.getUrl(key, { expiresInSeconds: COVER_TTL_SECONDS })
        : await this.storage.presignGet(key, COVER_TTL_SECONDS);
    } catch {
      return null;
    }
  }
}
