/**
 * The password gate may show the gallery's cover before the password — the owner's choice —
 * but only as a tiny stand-in the page blurs: a mood, never a usable photo.
 */
export interface CoverThumbnails {
  /** The photo's grid-sized display copy; `undefined` before it exists. */
  thumbnail(photoId: string): Promise<Buffer | undefined>;
}

export interface TeaserImages {
  /** Shrinks a thumbnail to a few dozen pixels wide, so no detail survives. */
  shrink(image: Buffer): Promise<Buffer>;
}
