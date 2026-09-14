import type { FastifyInstance, FastifyRequest } from "fastify";
import "./request-context";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ProjectRepository } from "../modules/media-ingestion/domain/project-repository";
import type { PhotoRepository } from "../modules/media-ingestion/domain/photo-repository";
import type { AlbumRepository } from "../modules/album-composition/domain/album-repository";
import type { ExportJobRepository } from "../modules/export-print/domain/export-job-repository";

export interface TenancyDependencies {
  projects: ProjectRepository;
  photos: PhotoRepository;
  albums: AlbumRepository;
  exportJobs: ExportJobRepository;
}

interface RouteParams {
  studioId?: string;
  projectId?: string;
  photoId?: string;
  albumId?: string;
  exportJobId?: string;
}

/**
 * Resolves whatever resource a route addresses back to its owning studio and
 * compares it to the authenticated one. Doing this once, generically, means a new
 * route cannot forget it and leak another studio's wedding.
 */
export function registerTenancyGuard(app: FastifyInstance, deps: TenancyDependencies): void {
  app.addHook("preHandler", async (request, reply) => {
    const studioId = request.studioId;
    if (!studioId) return; // public route — auth hook already allowed it

    const params = (request.params ?? {}) as RouteParams;
    const owner = await resolveOwningStudio(deps, params);

    if (owner === undefined) return; // route addresses no owned resource
    if (owner === null) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Resource not found." });
    }
    if (owner !== studioId) {
      // Deliberately a 404: confirming existence would leak another studio's data.
      return reply.code(404).send({ code: "NOT_FOUND", message: "Resource not found." });
    }
  });
}

async function resolveOwningStudio(
  deps: TenancyDependencies,
  params: RouteParams,
): Promise<string | null | undefined> {
  if (params.studioId) return params.studioId;

  if (params.projectId) return studioOfProject(deps, params.projectId);

  if (params.photoId) {
    const photo = await deps.photos.findById(UniqueEntityId.create(params.photoId));
    if (!photo) return null;
    return studioOfProject(deps, photo.projectId.toString());
  }

  if (params.albumId) return studioOfAlbum(deps, params.albumId);

  if (params.exportJobId) {
    const job = await deps.exportJobs.findById(UniqueEntityId.create(params.exportJobId));
    if (!job) return null;
    return studioOfAlbum(deps, job.albumId.toString());
  }

  return undefined;
}

async function studioOfProject(
  deps: TenancyDependencies,
  projectId: string,
): Promise<string | null> {
  const project = await deps.projects.findById(UniqueEntityId.create(projectId));
  return project ? project.studioId.toString() : null;
}

async function studioOfAlbum(deps: TenancyDependencies, albumId: string): Promise<string | null> {
  const album = await deps.albums.findById(UniqueEntityId.create(albumId));
  if (!album) return null;
  return studioOfProject(deps, album.projectId.toString());
}

/** Routes take the studio from the verified key, never from a caller-supplied path. */
export function authenticatedStudioId(request: FastifyRequest): string {
  const studioId = request.studioId;
  if (!studioId) throw new Error("Route requires authentication but no studio was resolved.");
  return studioId;
}
