import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { confirmUploadSchema, createProjectSchema, requestUploadSchema } from "@albumflow/contracts";
import { ApplicationError, NotFoundError } from "../../../../shared-kernel/errors";
import { authenticatedStudioId } from "../../../../interface/tenancy";
import { Project } from "../../domain/project";
import type { ProjectRepository } from "../../domain/project-repository";
import type { RequestUploadUseCase } from "../../application/use-cases/request-upload/request-upload.use-case";
import type { AbandonUploadUseCase } from "../../application/use-cases/abandon-upload/abandon-upload.use-case";
import type { ListStudioProjectsUseCase } from "../../application/use-cases/list-studio-projects/list-studio-projects.use-case";
import type { ConfirmUploadUseCase } from "../../application/use-cases/confirm-upload/confirm-upload.use-case";
import type { ListProjectPhotosUseCase } from "../../application/use-cases/list-project-photos/list-project-photos.use-case";
import type { DeleteProjectUseCase } from "../../application/use-cases/delete-project/delete-project.use-case";

const projectParamsSchema = z.object({
  studioId: z.string().uuid(),
  projectId: z.string().uuid(),
});

const photoParamsSchema = z.object({
  photoId: z.string().uuid(),
});

const listPhotosParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const studioParamsSchema = z.object({ studioId: z.string().uuid() });
const projectIdParamsSchema = z.object({ projectId: z.string().uuid() });

export interface MediaIngestionDependencies {
  requestUpload: RequestUploadUseCase;
  confirmUpload: ConfirmUploadUseCase;
  abandonUpload: AbandonUploadUseCase;
  listProjectPhotos: ListProjectPhotosUseCase;
  listStudioProjects: ListStudioProjectsUseCase;
  deleteProject: DeleteProjectUseCase;
  projects: ProjectRepository;
}

function toProjectDto(project: Project) {
  return {
    id: project.id.toString(),
    studioId: project.studioId.toString(),
    name: project.name,
    type: project.type,
    eventDate: project.eventDate?.toISOString() ?? null,
    clientName: project.clientName ?? null,
    clientEmail: project.clientEmail ?? null,
    createdAt: project.createdAt.toISOString(),
  };
}

export function registerMediaIngestionRoutes(app: FastifyInstance, deps: MediaIngestionDependencies): void {
  app.post("/studios/:studioId/projects", async (request, reply) => {
    studioParamsSchema.parse(request.params);
    const body = createProjectSchema.parse(request.body);

    const project = Project.create({
      studioId: UniqueEntityId.create(authenticatedStudioId(request)),
      name: body.name,
      type: body.type,
      ...(body.eventDate ? { eventDate: new Date(body.eventDate) } : {}),
      ...(body.clientName ? { clientName: body.clientName } : {}),
      ...(body.clientEmail ? { clientEmail: body.clientEmail } : {}),
    });
    await deps.projects.save(project);
    return reply.code(201).send(toProjectDto(project));
  });

  app.get("/studios/:studioId/projects", async (request) => {
    studioParamsSchema.parse(request.params);
    return deps.listStudioProjects.execute(authenticatedStudioId(request));
  });

  app.get("/projects/:projectId", async (request, reply) => {
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const project = await deps.projects.findById(UniqueEntityId.create(projectId));
    if (!project) return sendApplicationError(reply, new NotFoundError("Project", projectId));
    return toProjectDto(project);
  });

  app.post("/studios/:studioId/projects/:projectId/photos", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const body = requestUploadSchema.parse(request.body);

    const result = await deps.requestUpload.execute({
      // The studio comes from the verified key, not the path.
      studioId: authenticatedStudioId(request),
      projectId: params.projectId,
      fileName: body.fileName,
      mimeType: body.mimeType,
      byteSize: body.byteSize,
    });

    if (result.isFailure) {
      return sendApplicationError(reply, result.getError());
    }

    return reply.code(201).send(result.getValue());
  });

  app.post("/photos/:photoId/confirm-upload", async (request, reply) => {
    const params = photoParamsSchema.parse(request.params);
    const body = confirmUploadSchema.parse(request.body);

    const result = await deps.confirmUpload.execute({
      photoId: params.photoId,
      reportedChecksum: body.checksum,
      useAi: body.useAi,
    });

    if (result.isFailure) {
      return sendApplicationError(reply, result.getError());
    }

    return reply.code(200).send(result.getValue());
  });

  // What a cancelled batch leaves behind: rows whose upload never completed.
  app.delete("/photos/:photoId", async (request, reply) => {
    const params = photoParamsSchema.parse(request.params);
    const result = await deps.abandonUpload.execute({ photoId: params.photoId });
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return reply.code(204).send();
  });

  app.get("/projects/:projectId/photos", async (request) => {
    const params = listPhotosParamsSchema.parse(request.params);
    return deps.listProjectPhotos.execute(params.projectId);
  });

  app.delete("/projects/:projectId", async (request, reply) => {
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const result = await deps.deleteProject.execute({ projectId });
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return reply.code(204).send();
  });
}

function sendApplicationError(reply: import("fastify").FastifyReply, error: ApplicationError) {
  const status = error instanceof NotFoundError ? 404 : error.code === "CONFLICT" ? 409 : 422;
  return reply.code(status).send({ code: error.code, message: error.message });
}
