import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumRepository } from "#src/modules/album-composition/domain/album-repository";
import type { PlanFeatureDirectory } from "#src/shared-kernel/plan-features";
import type { PhotoFocusDirectory } from "#src/shared-kernel/photo-focus";
import type { StudioBrandingDirectory } from "#src/shared-kernel/studio-branding";
import type {
  AlbumGateway,
  PhotoPreviewResolver,
  ReviewNotifier,
  ReviewableAlbum,
} from "../../application/ports/album-gateway";
import { consoleLogger, type Logger } from "#src/shared-kernel/logger";

export class AlbumCompositionGateway implements AlbumGateway {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly previews?: PhotoPreviewResolver,
    private readonly features?: PlanFeatureDirectory,
    private readonly focus?: PhotoFocusDirectory,
    private readonly branding?: StudioBrandingDirectory,
  ) {}

  async load(albumId: string): Promise<ReviewableAlbum | undefined> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return undefined;
    const projectId = album.projectId.toString();
    const photoIds = [
      ...(album.cover?.photoId ? [album.cover.photoId] : []),
      ...album.spreads.flatMap((spread) => spread.placements.map((placement) => placement.photoId).filter(Boolean)),
    ];
    // Independent of each other, so fetched together — the client's first paint waits on the slowest, not the sum.
    const [focus, features, branding, previews] = await Promise.all([
      this.focus?.forProject(projectId),
      this.features?.forProject(projectId),
      this.branding?.forProject(projectId),
      this.previews?.previewUrls(photoIds),
    ]);
    const previewOf = (photoId: string | null | undefined) => (photoId ? (previews?.get(photoId) ?? null) : null);
    return {
      id: album.id.toString(),
      title: album.title,
      status: album.status,
      watermark: features?.watermarkDrafts ?? false,
      branding: branding ?? null,
      format: album.format,
      style: album.style,
      cover: album.cover
        ? {
            ...album.cover,
            focus: (album.cover.photoId && focus?.get(album.cover.photoId)) || null,
            previewUrl: previewOf(album.cover.photoId),
          }
        : null,
      spreads: album.spreads.map((spread) => ({
        templateId: spread.templateId,
        texts: spread.texts,
        placements: spread.placements.map((placement) => ({
          slotId: placement.slotId,
          photoId: placement.photoId,
          crop: placement.crop,
          treatment: placement.treatment ?? "COLOR",
          frame: placement.frame,
          focus: focus?.get(placement.photoId) ?? null,
          previewUrl: previewOf(placement.photoId),
        })),
      })),
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
  constructor(private readonly logger: Logger = consoleLogger) {}

  async clientDecided(params: {
    albumId: string;
    decision: string;
    clientName: string;
    openComments: number;
  }): Promise<void> {
    this.logger.info("client decided on an album", {
      albumId: params.albumId,
      decision: params.decision,
      openComments: params.openComments,
    });
  }
}
