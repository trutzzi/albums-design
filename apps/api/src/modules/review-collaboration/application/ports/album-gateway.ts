export interface ReviewableAlbum {
  id: string;
  title: string;
  status: string;
  format: { pageWidthMm: number; pageHeightMm: number; bleedMm: number };
  spreads: {
    templateId: string;
    placements: {
      slotId: string;
      photoId: string;
      previewUrl: string | null;
      crop: { x: number; y: number; width: number; height: number };
      treatment: "COLOR" | "BLACK_WHITE";
      frame?: { x: number; y: number; width: number; height: number } | undefined;
    }[];
  }[];
}

/** The client's browser loads originals straight from storage via short-lived URLs. */
export interface PhotoPreviewResolver {
  previewUrl(photoId: string): Promise<string | null>;
}

/** Review never mutates the album directly — it asks Album Composition to move state. */
export interface AlbumGateway {
  load(albumId: string): Promise<ReviewableAlbum | undefined>;
  markInReview(albumId: string): Promise<void>;
  markApproved(albumId: string): Promise<void>;
  markChangesRequested(albumId: string): Promise<void>;
}

export interface ReviewNotifier {
  clientDecided(params: {
    albumId: string;
    decision: "APPROVED" | "CHANGES_REQUESTED";
    clientName: string;
    openComments: number;
  }): Promise<void>;
}
