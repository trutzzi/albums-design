import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { albumEditSchema, generateAlbumSchema, suggestLayoutsSchema } from "@albumflow/contracts";
import { ApplicationError, NotFoundError } from "../../../../shared-kernel/errors";
import type { Album } from "../../domain/album";
import type { AlbumRepository } from "../../domain/album-repository";
import { LAYOUT_TEMPLATES } from "../../domain/layout-template";
import type { GenerateAlbumUseCase } from "../../application/use-cases/generate-album/generate-album.use-case";
import type { EditAlbumUseCase } from "../../application/use-cases/edit-album/edit-album.use-case";
import type { SuggestLayoutsUseCase } from "../../application/use-cases/suggest-layouts/suggest-layouts.use-case";
import type { DeleteAlbumUseCase } from "../../application/use-cases/delete-album/delete-album.use-case";

const projectParams = z.object({ projectId: z.string().uuid() });
const albumParams = z.object({ albumId: z.string().uuid() });

export interface AlbumCompositionDependencies {
  suggestLayouts: SuggestLayoutsUseCase;
  generateAlbum: GenerateAlbumUseCase;
  editAlbum: EditAlbumUseCase;
  deleteAlbum: DeleteAlbumUseCase;
  albums: AlbumRepository;
}

export function registerAlbumCompositionRoutes(
  app: FastifyInstance,
  deps: AlbumCompositionDependencies,
): void {
  app.get("/layout-templates", async () => LAYOUT_TEMPLATES);

  app.post("/projects/:projectId/spread-suggestions", async (request, reply) => {
    const { projectId } = projectParams.parse(request.params);
    const { photoIds } = suggestLayoutsSchema.parse(request.body);
    const result = await deps.suggestLayouts.execute({ projectId, photoIds });
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  app.post("/projects/:projectId/albums", async (request, reply) => {
    const { projectId } = projectParams.parse(request.params);
    const body = generateAlbumSchema.parse(request.body ?? {});

    const result = await deps.generateAlbum.execute({
      projectId,
      ...(body.title ? { title: body.title } : {}),
      targetSpreads: body.targetSpreads,
      ...(body.format ? { format: body.format } : {}),
      ...(body.photoIds ? { photoIds: body.photoIds } : {}),
    });

    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(201).send(toDto(result.getValue()));
  });

  app.get("/projects/:projectId/albums", async (request) => {
    const { projectId } = projectParams.parse(request.params);
    const albums = await deps.albums.findByProjectId(UniqueEntityId.create(projectId));
    return albums.map(toDto);
  });

  app.get("/albums/:albumId", async (request, reply) => {
    const { albumId } = albumParams.parse(request.params);
    const album = await deps.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return sendError(reply, new NotFoundError("Album", albumId));
    return toDto(album);
  });

  app.patch("/albums/:albumId", async (request, reply) => {
    const { albumId } = albumParams.parse(request.params);
    const command = albumEditSchema.parse(request.body);
    const result = await deps.editAlbum.execute(albumId, command);
    if (result.isFailure) return sendError(reply, result.getError());
    return toDto(result.getValue());
  });

  app.delete("/albums/:albumId", async (request, reply) => {
    const { albumId } = albumParams.parse(request.params);
    const result = await deps.deleteAlbum.execute({ albumId });
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(204).send();
  });
}

export function toDto(album: Album) {
  return {
    id: album.id.toString(),
    projectId: album.projectId.toString(),
    title: album.title,
    status: album.status,
    format: album.format,
    spreads: album.spreads,
    spreadCount: album.spreadCount,
    pageCount: album.pageCount,
    photoCount: album.photoCount,
    updatedAt: album.updatedAt.toISOString(),
  };
}

function sendError(reply: FastifyReply, error: ApplicationError) {
  const status = error instanceof NotFoundError ? 404 : error.code === "CONFLICT" ? 409 : 422;
  return reply.code(status).send({ code: error.code, message: error.message });
}
