import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, type ApplicationError } from "../../../../shared-kernel/errors";
import type { ExportJob } from "../../domain/export-job";
import type { ExportJobRepository } from "../../domain/export-job-repository";
import { findPrintProfile } from "../../domain/print-profile";
import type { AlbumPdfRenderer, ExportStorage } from "../ports/album-pdf-renderer";
import type { ExportAlbumGateway } from "./request-export.use-case";

export class RunExportUseCase {
  constructor(
    private readonly jobs: ExportJobRepository,
    private readonly albums: ExportAlbumGateway,
    private readonly renderer: AlbumPdfRenderer,
    private readonly storage: ExportStorage,
  ) {}

  async execute(exportJobId: string): Promise<Result<ExportJob, ApplicationError>> {
    const job = await this.jobs.findById(UniqueEntityId.create(exportJobId));
    if (!job) return Result.failure(new NotFoundError("Export job", exportJobId));

    const album = await this.albums.load(job.albumId.toString());
    if (!album) return Result.failure(new NotFoundError("Album", job.albumId.toString()));

    const profile = findPrintProfile(job.printProfileId);
    if (!profile) return Result.failure(new NotFoundError("Print profile", job.printProfileId));

    job.markRendering();
    await this.jobs.save(job);

    try {
      const rendered = await this.renderer.render(album, profile);
      const key = `exports/${album.id}/${job.id.toString()}.pdf`;
      await this.storage.put(key, rendered.bytes, "application/pdf");

      job.markReady({
        storageKey: key,
        byteSize: rendered.bytes.byteLength,
        pageCount: rendered.pageCount,
      });
      await this.jobs.save(job);
      await this.albums.markExported(album.id);
    } catch (error) {
      job.markFailed(error instanceof Error ? error.message : "Rendering failed.");
      await this.jobs.save(job);
    }

    return Result.success(job);
  }
}
