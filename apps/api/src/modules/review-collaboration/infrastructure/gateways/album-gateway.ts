import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "../../../album-composition/domain/album-repository";
import type { PlanFeatureDirectory } from "../../../../shared-kernel/plan-features";
import type { PhotoFocusDirectory } from "../../../../shared-kernel/photo-focus";
import type {
  AlbumGateway,
  PhotoPreviewResolver,
  ReviewNotifier,
  ReviewableAlbum,
} from "../../application/ports/album-gateway";

export class AlbumCompositionGateway implements AlbumGateway {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly previews?: PhotoPreviewResolver,
    private readonly features?: PlanFeatureDirectory,
    private readonly focus?: PhotoFocusDirectory,
  ) {}

  async load(albumId: string): Promise<ReviewableAlbum | undefined> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return undefined;
    const focus = await this.focus?.forProject(album.projectId.toString());
    return {
      id: album.id.toString(),
      title: album.title,
      status: album.status,
      watermark: (await this.features?.forProject(album.projectId.toString()))?.watermarkDrafts ?? false,
      format: album.format,
      style: album.style,
      cover: album.cover
        ? {
            ...album.cover,
            focus: (album.cover.photoId && focus?.get(album.cover.photoId)) || null,
            previewUrl: album.cover.photoId ? ((await this.previews?.previewUrl(album.cover.photoId)) ?? null) : null,
          }
        : null,
      spreads: await Promise.all(
        album.spreads.map(async (spread) => ({
          templateId: spread.templateId,
          texts: spread.texts,
          placements: await Promise.all(
            spread.placements.map(async (placement) => ({
              slotId: placement.slotId,
              photoId: placement.photoId,
              crop: placement.crop,
              treatment: placement.treatment ?? "COLOR",
              frame: placement.frame,
              focus: focus?.get(placement.photoId) ?? null,
              previewUrl: placement.photoId
                ? ((await this.previews?.previewUrl(placement.photoId)) ?? null)
                : null,
            })),
          ),
        })),
      ),
    };
  }

  async markInReview(albumId: string): Promise<void> {
    await this.transition(albumId, (album) => album.submitForReview());
  }

  async markApproved(albumId: string): Promise<void> {
    await this.transition(albumId, (album) => album.approve());
  }

  async markChangesRequested(albumId: string): Promise<void> {
    await this.transition(albumId, (album) => album.recordChangesRequested());
  }

  private async transition(
    albumId: string,
    mutate: (album: NonNullable<Awaited<ReturnType<AlbumRepository["findById"]>>>) => void,
  ): Promise<void> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return;
    mutate(album);
    await this.albums.save(album);
  }
}

/** Email/push lands in Epic 5's follow-up; the log keeps the flow observable today. */
export class LoggingReviewNotifier implements ReviewNotifier {
  constructor(private readonly log: (message: string) => void = console.log) {}

  async clientDecided(params: {
    albumId: string;
    decision: string;
    clientName: string;
    openComments: number;
  }): Promise<void> {
    this.log(
      `[review] ${params.clientName} ${params.decision} album ${params.albumId} (${params.openComments} open comments)`,
    );
  }
}
