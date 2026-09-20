import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ProjectRepository } from "../../../media-ingestion/domain/project-repository";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { Photo } from "../../../media-ingestion/domain/photo";
import type { ObjectStorageWithBody } from "../../../media-ingestion/application/ports/object-storage";
import type { StudioMemberRepository, StudioRepository } from "../../../identity/domain/repositories";
import type { StorageProvider } from "../../../../shared-kernel/storage-provider";
import type { DeliverablePhoto, DeliveryGateway, StudioContacts } from "../../application/ports/delivery-gateway";
import type { PickNotifier } from "../../application/ports/pick-gateway";

/** Anti-corruption layer over Media Ingestion for handing originals to a client. */
export class MediaIngestionDeliveryGateway implements DeliveryGateway {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly photos: PhotoRepository,
    private readonly staging: ObjectStorageWithBody,
    private readonly permanent?: StorageProvider,
  ) {}

  async loadProject(projectId: string) {
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    return project ? { id: project.id.toString(), name: project.name } : undefined;
  }

  async listDeliverable(projectId: string) {
    const photos = await this.photos.findByProjectId(UniqueEntityId.create(projectId));
    const available: DeliverablePhoto[] = [];
    let missing = 0;
    for (const photo of photos) {
      if (photo.status === "PENDING_UPLOAD") continue; // never finished uploading — there is no file
      if (this.hasOriginal(photo)) available.push(this.toDeliverable(photo));
      else missing++;
    }
    return { available, missing };
  }

  /** An original survives in staging until retention deletes it, and on long-term storage if it was ever promoted. */
  private hasOriginal(photo: Photo): boolean {
    if (!photo.stagedOriginalPurgedAt) return true;
    return Boolean(this.permanent && photo.fullResStoredAt);
  }

  private toDeliverable(photo: Photo): DeliverablePhoto {
    const key = photo.storageKey.toString();
    return {
      photoId: photo.id.toString(),
      fileName: photo.fileName,
      byteSize: photo.byteSize,
      read: async () => {
        if (!photo.stagedOriginalPurgedAt) {
          try {
            return await this.staging.getObject(key);
          } catch (error) {
            if (!this.permanent || !photo.fullResStoredAt) throw error;
          }
        }
        const chunks: Buffer[] = [];
        for await (const chunk of await this.permanent!.openRead(key)) chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks);
      },
    };
  }
}

/**
 * Who hears about a client's activity: the address shown as the studio's owner
 * in Studio settings, plus anyone with the OWNER role. Normally the same person;
 * both are used so what the settings page displays is never different from where
 * the emails go.
 */
export class IdentityStudioContacts implements StudioContacts {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly members: StudioMemberRepository,
    private readonly studios?: StudioRepository,
  ) {}

  async forProject(projectId: string) {
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    if (!project) return undefined;
    const studio = await this.studios?.findById(project.studioId);
    const members = await this.members.listByStudioId(project.studioId);
    const emails = [
      ...(studio ? [studio.ownerEmail] : []),
      ...members.filter((member) => member.role === "OWNER").map((member) => member.email),
    ];
    // Case-insensitively unique, first spelling kept.
    const seen = new Set<string>();
    const ownerEmails = emails.filter((email) => {
      const key = email.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { projectName: project.name, ownerEmails };
  }
}

/** Runs several notifiers for one event; one failing never stops the others. */
export class CompositePickNotifier implements PickNotifier {
  constructor(
    private readonly notifiers: PickNotifier[],
    private readonly log: (message: string) => void = console.error,
  ) {}

  async picksSubmitted(params: Parameters<PickNotifier["picksSubmitted"]>[0]): Promise<void> {
    for (const notifier of this.notifiers) {
      try {
        await notifier.picksSubmitted(params);
      } catch (error) {
        this.log(`[picks] a notifier failed: ${String(error)}`);
      }
    }
  }
}
