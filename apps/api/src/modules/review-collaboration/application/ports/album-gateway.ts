import type { AlbumCoverDTO, AlbumStyleDTO, ClientBrandingDTO, PhotoFocus, TextBlockDTO } from "@albumflow/contracts";

export interface ReviewableAlbum {
  id: string;
  title: string;
  status: string;
  /** The studio's plan puts a watermark over client proofs. */
  watermark: boolean;
  /** The studio's own name, colour and logo, when its plan includes them. */
  branding?: ClientBrandingDTO | null;
  format: { pageWidthMm: number; pageHeightMm: number; bleedMm: number };
  style: AlbumStyleDTO;
  /** The cover the client will hold, with a loadable preview of its photo. */
  cover: (AlbumCoverDTO & { previewUrl: string | null; focus?: PhotoFocus | null }) | null;
  spreads: {
    templateId: string;
    texts?: TextBlockDTO[] | undefined;
    placements: {
      slotId: string;
      photoId: string;
      previewUrl: string | null;
      crop: { x: number; y: number; width: number; height: number };
      treatment: "COLOR" | "BLACK_WHITE";
      frame?: { x: number; y: number; width: number; height: number } | undefined;
      /** Where the subject sits, so an untouched crop frames it like the editor does. */
      focus?: PhotoFocus | null;
    }[];
  }[];
}

/** The client's browser loads originals straight from storage via short-lived URLs. */
export interface PhotoPreviewResolver {
  /**
   * Preview URLs for every photo on an album at once, keyed by photo id — one lookup, not
   * one per photo. A photo that no longer exists is absent from the map.
   */
  previewUrls(photoIds: string[]): Promise<Map<string, string>>;
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
