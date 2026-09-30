import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "../../../album-composition/domain/album-repository";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { PhotoByteSource } from "../../../photo-intelligence/application/ports/photo-source";
import type { PhotoResolver, RenderableAlbum } from "../../application/ports/album-pdf-renderer";
import type { ExportAlbumGateway } from "../../application/use-cases/request-export.use-case";
import type { PlanFeatureDirectory } from "../../../../shared-kernel/plan-features";

export const TRIAL_WATERMARK = "AlbumFlow · trial";

export class AlbumCompositionExportGateway implements ExportAlbumGateway {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly features?: PlanFeatureDirectory,
  ) {}

  async load(albumId: string): Promise<RenderableAlbum | undefined> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return undefined;
    const features = await this.features?.forProject(album.projectId.toString());
    return {
      id: album.id.toString(),
      title: album.title,
      watermark: features?.watermarkExports ? TRIAL_WATERMARK : undefined,
      format: album.format,
      style: album.style,
      cover: album.cover,
      spreads: album.spreads.map((spread) => ({
        templateId: spread.templateId,
        placements: spread.placements.map((placement) => ({
          slotId: placement.slotId,
          photoId: placement.photoId,
          crop: placement.crop,
          treatment: placement.treatment ?? "COLOR",
          frame: placement.frame,
        })),
        texts: spread.texts,
      })),
    };
  }

  async markExported(albumId: string): Promise<void> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return;
    album.markExported();
    await this.albums.save(album);
  }
}

export class StoredPhotoResolver implements PhotoResolver {
  private readonly cache = new Map<string, Uint8Array>();

  constructor(
    private readonly photos: PhotoRepository,
    private readonly bytes: PhotoByteSource,
  ) {}

  async resolve(photoId: string): Promise<Uint8Array | undefined> {
    const cached = this.cache.get(photoId);
    if (cached) return cached;

    const photo = await this.photos.findById(UniqueEntityId.create(photoId));
    if (!photo) return undefined;

    const data = await this.bytes.read(photo.storageKey.toString());
    // One photo often appears on several spreads; re-downloading it per placement
    // would dominate export time on a 40-spread album.
    this.cache.set(photoId, data);
    return data;
  }
}
