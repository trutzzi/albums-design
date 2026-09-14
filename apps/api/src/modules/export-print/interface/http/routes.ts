import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { ApplicationError, NotFoundError } from "../../../../shared-kernel/errors";
import type { ExportJob } from "../../domain/export-job";
import type { ExportJobRepository } from "../../domain/export-job-repository";
import { PRINT_PROFILES } from "../../domain/print-profile";
import type { ExportStorage } from "../../application/ports/album-pdf-renderer";
import type { RequestExportUseCase } from "../../application/use-cases/request-export.use-case";

const albumParams = z.object({ albumId: z.string().uuid() });
const jobParams = z.object({ exportJobId: z.string().uuid() });
const requestSchema = z.object({ printProfileId: z.string().optional() });

const DOWNLOAD_TTL_SECONDS = 15 * 60;

export interface ExportDependencies {
  requestExport: RequestExportUseCase;
  jobs: ExportJobRepository;
  storage: ExportStorage;
}

export function registerExportRoutes(app: FastifyInstance, deps: ExportDependencies): void {
  app.get("/print-profiles", async () => PRINT_PROFILES);

  app.post("/albums/:albumId/exports", async (request, reply) => {
    const { albumId } = albumParams.parse(request.params);
    const body = requestSchema.parse(request.body ?? {});
    const result = await deps.requestExport.execute({
      albumId,
      ...(body.printProfileId ? { printProfileId: body.printProfileId } : {}),
    });
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(202).send(toDto(result.getValue()));
  });

  app.get("/albums/:albumId/exports", async (request) => {
    const { albumId } = albumParams.parse(request.params);
    const jobs = await deps.jobs.findByAlbumId(UniqueEntityId.create(albumId));
    return jobs.map(toDto);
  });

  app.get("/exports/:exportJobId/download", async (request, reply) => {
    const { exportJobId } = jobParams.parse(request.params);
    const job = await deps.jobs.findById(UniqueEntityId.create(exportJobId));
    if (!job) return sendError(reply, new NotFoundError("Export job", exportJobId));
    if (job.status !== "READY" || !job.storageKey) {
      return reply.code(409).send({ code: "NOT_READY", message: `Export is ${job.status}.` });
    }
    const url = await deps.storage.presignGet(job.storageKey, DOWNLOAD_TTL_SECONDS);
    return { url, expiresInSeconds: DOWNLOAD_TTL_SECONDS };
  });
}

function toDto(job: ExportJob) {
  return {
    id: job.id.toString(),
    albumId: job.albumId.toString(),
    printProfileId: job.printProfileId,
    status: job.status,
    byteSize: job.byteSize ?? null,
    pageCount: job.pageCount ?? null,
    failureReason: job.failureReason ?? null,
    requestedAt: job.requestedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function sendError(reply: FastifyReply, error: ApplicationError) {
  const status = error instanceof NotFoundError ? 404 : error.code === "CONFLICT" ? 409 : 422;
  return reply.code(status).send({ code: error.code, message: error.message });
}
