import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "../../../album-composition/domain/album-repository";
import type { ExportJobRepository } from "../../../export-print/domain/export-job-repository";
import type { DeliveryDirectory } from "../../application/ports/delivery-directory";

export class ExportPrintDeliveryDirectory implements DeliveryDirectory {
  constructor(
    private readonly exportJobs: ExportJobRepository,
    private readonly albums: AlbumRepository,
  ) {}

  async projectsDeliveredBefore(cutoff: Date): Promise<string[]> {
    const candidates = await this.exportJobs.findReadyCompletedBefore(cutoff);

    const projectByAlbum = new Map<string, string>();
    for (const albumId of new Set(candidates.map((job) => job.albumId.toString()))) {
      const album = await this.albums.findById(UniqueEntityId.create(albumId));
      if (album) projectByAlbum.set(albumId, album.projectId.toString());
    }

    // A project qualifies only if *every* album's latest delivery is old enough:
    // one recently re-exported album keeps the whole shoot's originals in place.
    const latestByProject = new Map<string, Date>();
    for (const projectId of new Set(projectByAlbum.values())) {
      const albums = await this.albums.findByProjectId(UniqueEntityId.create(projectId));
      let latest: Date | undefined;
      for (const album of albums) {
        for (const job of await this.exportJobs.findByAlbumId(album.id)) {
          if (job.status === "READY" && job.completedAt && (!latest || job.completedAt > latest)) {
            latest = job.completedAt;
          }
        }
      }
      if (latest) latestByProject.set(projectId, latest);
    }

    return [...latestByProject].filter(([, latest]) => latest < cutoff).map(([projectId]) => projectId);
  }
}
