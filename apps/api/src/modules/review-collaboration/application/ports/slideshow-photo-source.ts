import type { PickablePhoto } from "./pick-gateway";

/**
 * Where a slideshow's photos come from, without importing Album Composition's or
 * Media Ingestion's aggregates. Every method answers with photo ids in play order;
 * `slides` turns saved ids into display copies.
 */
export interface SlideshowPhotoSource {
  /** The client's most recently submitted picks, in shoot order. `undefined` when nothing has been submitted. */
  submittedPicks(projectId: string): Promise<string[] | undefined>;
  /** Cover first, then every spread in order. `undefined` when the album is not on this shoot. */
  albumPhotos(projectId: string, albumId: string): Promise<string[] | undefined>;
  /** Every photo with display copies, in shoot order. */
  shootPhotos(projectId: string): Promise<string[]>;
  /** Display copies for `photoIds`, in the same order, skipping any that no longer exist. Never an original. */
  slides(projectId: string, photoIds: readonly string[]): Promise<PickablePhoto[]>;
}
