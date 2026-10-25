/**
 * How the delivery gallery is arranged for the client: the cover photo above it and
 * the chapters it is split into. Pure functions over what analysis said about each photo.
 */

export interface GalleryTraits {
  category: string;
  score: number;
}

interface GalleryPhoto {
  id: string;
  width: number | null;
  height: number | null;
}

/** The categories that make a good cover, most fitting first. */
const COVER_CATEGORIES = ["COUPLE", "PORTRAIT"];

/**
 * The photographer's choice when it is still in the gallery; otherwise the best-rated
 * couple shot, then portrait, then any photo. An upright photo wins a tie because the
 * cover fills a tall half of the screen.
 */
export function chooseCover(
  photos: readonly GalleryPhoto[],
  traits: ReadonlyMap<string, GalleryTraits>,
  chosen?: string,
): string | null {
  if (chosen && photos.some((photo) => photo.id === chosen)) return chosen;
  for (const category of [...COVER_CATEGORIES, undefined]) {
    const candidates = photos.filter((photo) => {
      const found = traits.get(photo.id);
      return category === undefined ? found !== undefined : found?.category === category;
    });
    const best = bestOf(candidates, traits);
    if (best) return best.id;
  }
  return photos[0]?.id ?? null;
}

function bestOf(photos: readonly GalleryPhoto[], traits: ReadonlyMap<string, GalleryTraits>): GalleryPhoto | undefined {
  let best: GalleryPhoto | undefined;
  let bestRank = -Infinity;
  for (const photo of photos) {
    const upright = photo.width !== null && photo.height !== null && photo.height > photo.width;
    const rank = (traits.get(photo.id)?.score ?? 0) + (upright ? 0.5 : 0);
    if (rank > bestRank) {
      best = photo;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * The chapters present in the shoot, in the order they first appear. Photos are listed
 * in file-name order, which follows the camera's clock, so this is the order of the day
 * (preparations before the ceremony) without hard-coding one.
 */
export function storySections(photos: readonly { id: string }[], traits: ReadonlyMap<string, GalleryTraits>): string[] {
  const seen = new Set<string>();
  for (const photo of photos) {
    const category = traits.get(photo.id)?.category;
    if (category) seen.add(category);
  }
  return [...seen];
}
