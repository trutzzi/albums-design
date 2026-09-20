import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ProjectRepository } from "../../../media-ingestion/domain/project-repository";
import type { AlbumRepository } from "../../../album-composition/domain/album-repository";
import type { ClientContact, ClientContactDirectory } from "../../application/ports/client-contact";

/**
 * Anti-corruption layer over the shoot: client links read and update the contact without
 * reaching into Media Ingestion's aggregate themselves.
 */
export class ProjectClientContactDirectory implements ClientContactDirectory {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly albums: AlbumRepository,
  ) {}

  async forProject(projectId: string): Promise<ClientContact | undefined> {
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    if (!project) return undefined;
    return {
      projectId: project.id.toString(),
      projectName: project.name,
      name: project.clientName,
      email: project.clientEmail,
    };
  }

  async forAlbum(albumId: string): Promise<ClientContact | undefined> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return undefined;
    return this.forProject(album.projectId.toString());
  }

  async remember(
    projectId: string,
    contact: { name?: string | undefined; email?: string | undefined },
  ): Promise<void> {
    if (!contact.name?.trim() && !contact.email?.trim()) return;
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    if (!project) return;
    project.rememberClient(contact);
    await this.projects.save(project);
  }
}
