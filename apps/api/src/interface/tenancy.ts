import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import "./request-context";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ProjectRepository } from "../modules/media-ingestion/domain/project-repository";
import type { PhotoRepository } from "../modules/media-ingestion/domain/photo-repository";
import type { AlbumRepository } from "../modules/album-composition/domain/album-repository";
import type { ExportJobRepository } from "../modules/export-print/domain/export-job-repository";

/**
 * Which studio owns a resource a route can address — `null` when it does not exist.
 * One question per kind of id, so an adapter can answer each with a single query.
 */
export interface ResourceOwnership {
  studioOfProject(projectId: string): Promise<string | null>;
  studioOfPhoto(photoId: string): Promise<string | null>;
  studioOfAlbum(albumId: string): Promise<string | null>;
  studioOfExportJob(exportJobId: string): Promise<string | null>;
}

export interface TenancyDependencies {
  projects: ProjectRepository;
  photos: PhotoRepository;
  albums: AlbumRepository;
  exportJobs: ExportJobRepository;
}

/**
 * Answers ownership by walking the repositories (photo → project → studio). Used by
 * demo mode and tests, whose repositories live in memory; production uses the single-
 * query adapter in infrastructure/persistence.
 */
export class RepositoryResourceOwnership implements ResourceOwnership {
  constructor(private readonly deps: TenancyDependencies) {}

  async studioOfProject(projectId: string): Promise<string | null> {
    const project = await this.deps.projects.findById(UniqueEntityId.create(projectId));
    return project ? project.studioId.toString() : null;
  }

  async studioOfPhoto(photoId: string): Promise<string | null> {
    const photo = await this.deps.photos.findById(UniqueEntityId.create(photoId));
    return photo ? this.studioOfProject(photo.projectId.toString()) : null;
  }

  async studioOfAlbum(albumId: string): Promise<string | null> {
    const album = await this.deps.albums.findById(UniqueEntityId.create(albumId));
    return album ? this.studioOfProject(album.projectId.toString()) : null;
  }

  async studioOfExportJob(exportJobId: string): Promise<string | null> {
    const job = await this.deps.exportJobs.findById(UniqueEntityId.create(exportJobId));
    return job ? this.studioOfAlbum(job.albumId.toString()) : null;
  }
}

interface RouteParams {
  studioId?: string;
  projectId?: string;
  photoId?: string;
  albumId?: string;
  exportJobId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves whatever resource a route addresses back to its owning studio and
 * compares it to the authenticated one. Doing this once, generically, means a new
 * route cannot forget it and leak another studio's wedding. A route that names both
 * a studio and a resource has both checked.
 */
export function registerTenancyGuard(app: FastifyInstance, ownership: ResourceOwnership): void {
  app.addHook("preHandler", async (request, reply) => {
    const studioId = request.studioId;
    if (!studioId) return; // public route — auth hook already allowed it

    const params = (request.params ?? {}) as RouteParams;
    if (params.studioId !== undefined && params.studioId !== studioId) return notFound(reply);

    const lookup = ownerLookup(ownership, params);
    if (!lookup) return; // route addresses no owned resource
    // An id that is not a UUID names nothing; answering here spares the database a query it would reject.
    if (!UUID.test(lookup.id)) return notFound(reply);
    // Deliberately a 404 for someone else's resource too: confirming existence would leak another studio's data.
    if ((await lookup.owner(lookup.id)) !== studioId) return notFound(reply);
  });
}

function ownerLookup(
  ownership: ResourceOwnership,
  params: RouteParams,
): { id: string; owner: (id: string) => Promise<string | null> } | undefined {
  if (params.projectId !== undefined) return { id: params.projectId, owner: (id) => ownership.studioOfProject(id) };
  if (params.photoId !== undefined) return { id: params.photoId, owner: (id) => ownership.studioOfPhoto(id) };
  if (params.albumId !== undefined) return { id: params.albumId, owner: (id) => ownership.studioOfAlbum(id) };
  if (params.exportJobId !== undefined) return { id: params.exportJobId, owner: (id) => ownership.studioOfExportJob(id) };
  return undefined;
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ code: "NOT_FOUND", message: "Resource not found." });
}

/** Routes take the studio from the verified key, never from a caller-supplied path. */
export function authenticatedStudioId(request: FastifyRequest): string {
  const studioId = request.studioId;
  if (!studioId) throw new Error("Route requires authentication but no studio was resolved.");
  return studioId;
}
