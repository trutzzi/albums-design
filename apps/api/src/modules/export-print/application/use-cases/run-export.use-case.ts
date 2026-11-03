import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { NotFoundError, type ApplicationError } from "#src/shared-kernel/errors";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";
import type { ExportJob } from "../../domain/export-job";
import type { ExportJobRepository } from "../../domain/export-job-repository";
import { findPrintProfile } from "../../domain/print-profile";
import type { AlbumJpegRenderer, AlbumPdfRenderer, ExportStorage, RenderableAlbum } from "../ports/album-pdf-renderer";
import type { PrintProfile } from "../../domain/print-profile";
import type { ExportAlbumGateway } from "./request-export.use-case";

export class RunExportUseCase {
  constructor(
    private readonly jobs: ExportJobRepository,
    private readonly albums: ExportAlbumGateway,
    private readonly renderer: AlbumPdfRenderer,
    private readonly storage: ExportStorage,
    private readonly jpegRenderer: AlbumJpegRenderer,
    private readonly logger: Logger = consoleLogger,
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

    const context = { exportJobId, albumId: album.id, format: job.format, printProfileId: job.printProfileId };
    let uploadedKey: string | undefined;
    try {
      const rendered =
        job.format === "JPG_ZIP"
          ? await this.renderJpegs(album, profile, job.id.toString())
          : await this.renderPdf(album, profile, job.id.toString());
      uploadedKey = rendered.key;

      job.markReady({
        storageKey: rendered.key,
        byteSize: rendered.byteSize,
        pageCount: rendered.pageCount,
        // The album can change size later; this file stays the size it was made at.
        pageWidthMm: album.format.pageWidthMm,
        pageHeightMm: album.format.pageHeightMm,
      });
      await this.jobs.save(job);
    } catch (error) {
      // A photographer waiting on a file for their lab: worth an error, not just a status.
      this.logger.error("album export failed", { ...context, err: error });
      // A file stored for a job that never became READY would be unreachable forever.
      if (uploadedKey) {
        await this.storage.delete(uploadedKey).catch((cleanup: unknown) => {
          this.logger.error("failed export's file not removed", { ...context, storageKey: uploadedKey, err: cleanup });
        });
      }
      job.markFailed(error instanceof Error ? error.message : "Rendering failed.");
      await this.jobs.save(job);
      return Result.success(job);
    }

    // The album's status is a side effect: if it cannot be updated, the finished file
    // is still the photographer's to download, so the job stays READY.
    try {
      await this.albums.markExported(album.id);
    } catch (error) {
      this.logger.error("album not marked as exported", { ...context, err: error });
    }

    return Result.success(job);
  }

  private async renderPdf(album: RenderableAlbum, profile: PrintProfile, jobId: string) {
    const rendered = await this.renderer.render(album, profile);
    const key = `exports/${album.id}/${jobId}.pdf`;
    await this.storage.put(key, rendered.bytes, "application/pdf");
    return { key, byteSize: rendered.bytes.byteLength, pageCount: rendered.pageCount };
  }

  /**
   * Spreads at full print resolution run to tens of megabytes each, so the ZIP is built in
   * a temporary folder and streamed to storage, never held in memory, then removed.
   */
  private async renderJpegs(album: RenderableAlbum, profile: PrintProfile, jobId: string) {
    const folder = await mkdtemp(join(tmpdir(), "albumflow-jpg-"));
    try {
      const path = join(folder, "album.zip");
      const { fileCount } = await this.jpegRenderer.renderZip(album, profile, path);
      // The last part of the key is the name a browser saves the download under.
      const key = `exports/${album.id}/${jobId}/${downloadName(album.title)}-jpg.zip`;
      await this.storage.putFile(key, path, "application/zip");
      return { key, byteSize: (await stat(path)).size, pageCount: fileCount };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
}

/** "Luiza & Adrian — Album" → "luiza-adrian-album": a file name every lab's system accepts. */
export function downloadName(title: string): string {
  const name = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return name || "album";
}
