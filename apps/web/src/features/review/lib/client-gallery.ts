import type { DownloadScope } from "@/shared/api";

/** What the gallery shows right now — the same shape as what a download can hold, so "this section" is just the filter. */
export type GalleryFilter = DownloadScope;

export function filterGallery<Photo extends { id: string; section: string | null }>(
  photos: readonly Photo[],
  filter: GalleryFilter,
  favorites: ReadonlySet<string>,
): Photo[] {
  if (filter.kind === "favorites") return photos.filter((photo) => favorites.has(photo.id));
  if (filter.kind === "section") return photos.filter((photo) => photo.section === filter.section);
  return [...photos];
}

/** How many photos each chapter holds, for the counts beside the tabs. Photos without a chapter are left out. */
export function sectionCounts(photos: readonly { section: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    if (photo.section) counts.set(photo.section, (counts.get(photo.section) ?? 0) + 1);
  }
  return counts;
}

/**
 * How big the download for `scope` will be. Photos whose original is no longer stored
 * have no size and are in no download, so they add nothing.
 */
export function scopeBytes(
  photos: readonly { id: string; section: string | null; byteSize: number | null }[],
  scope: DownloadScope,
  favorites: ReadonlySet<string>,
): number {
  return filterGallery(photos, scope, favorites).reduce((sum, photo) => sum + (photo.byteSize ?? 0), 0);
}

/** A file size the way people read it: KB under a megabyte, one decimal in MB, two in GB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A stable string for a filter, to reset the gallery's batching when it changes. */
export function filterKey(filter: GalleryFilter): string {
  return filter.kind === "section" ? `section:${filter.section}` : filter.kind;
}

/** The first chapters as tabs, the rest behind "More" — keeping the active one visible as a tab. */
export function splitTabs(sections: readonly string[], visible: number, active?: string): [string[], string[]] {
  const shown = sections.slice(0, visible);
  const hidden = sections.slice(visible);
  if (active && hidden.includes(active) && shown.length > 0) {
    const dropped = shown.pop()!;
    return [
      [...shown, active],
      [dropped, ...hidden.filter((section) => section !== active)],
    ];
  }
  return [shown, hidden];
}

// The contact helpers moved to shared/lib/contact so any client page can use them.
export { buildVCard, displayWebsite, telUrl, whatsappUrl } from "@/shared/lib/contact";
