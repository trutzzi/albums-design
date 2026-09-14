import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import {
  NotFoundError,
  ValidationError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import { QUEUES, type JobQueue } from "../../../../shared-kernel/job-queue";
import { ExportJob } from "../../domain/export-job";
import type { ExportJobRepository } from "../../domain/export-job-repository";
import { DEFAULT_PRINT_PROFILE_ID, findPrintProfile } from "../../domain/print-profile";
import type { RenderableAlbum } from "../ports/album-pdf-renderer";

export interface ExportAlbumGateway {
  load(albumId: string): Promise<RenderableAlbum | undefined>;
  markExported(albumId: string): Promise<void>;
}

export interface RequestExportCommand {
  albumId: string;
  printProfileId?: string;
}

export class RequestExportUseCase {
  constructor(
    private readonly jobs: ExportJobRepository,
    private readonly albums: ExportAlbumGateway,
    private readonly queue: JobQueue,
  ) {}

  async execute(command: RequestExportCommand): Promise<Result<ExportJob, ApplicationError>> {
    const album = await this.albums.load(command.albumId);
    if (!album) return Result.failure(new NotFoundError("Album", command.albumId));

    const profileId = command.printProfileId ?? DEFAULT_PRINT_PROFILE_ID;
    if (!findPrintProfile(profileId)) {
      return Result.failure(new ValidationError(`Unknown print profile ${profileId}.`));
    }

    const placed = album.spreads.some((spread) =>
      spread.placements.some((placement) => placement.photoId !== ""),
    );
    if (!placed) {
      return Result.failure(new ValidationError("This album has no photos placed yet."));
    }

    const job = ExportJob.request({
      albumId: UniqueEntityId.create(command.albumId),
      printProfileId: profileId,
    });
    await this.jobs.save(job);

    await this.queue.enqueue(QUEUES.albumExport, "render-album", {
      exportJobId: job.id.toString(),
      albumId: command.albumId,
      printProfileId: profileId,
    });

    return Result.success(job);
  }
}
