import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "../../../album-composition/domain/album-repository";
import type { PhotoRepository } from "../../../media-ingestion/domain/photo-repository";
import type { PhotoByteSource } from "../../../photo-intelligence/application/ports/photo-source";
import type { PhotoResolver, RenderableAlbum } from "../../application/ports/album-pdf-renderer";
import type { ExportAlbumGateway } from "../../application/use-cases/request-export.use-case";

export class AlbumCompositionExportGateway implements ExportAlbumGateway {
  constructor(private readonly albums: AlbumRepository) {}

  async load(albumId: string): Promise<RenderableAlbum | undefined> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return undefined;
    return {
      id: album.id.toString(),
      title: album.title,
      format: album.format,
      spreads: album.spreads.map((spread) => ({
        templateId: spread.templateId,
        placements: spread.placements.map((placement) => ({
          slotId: placement.slotId,
          photoId: placement.photoId,
          crop: placement.crop,
          treatment: placement.treatment ?? "COLOR",
          frame: placement.frame,
        })),
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
