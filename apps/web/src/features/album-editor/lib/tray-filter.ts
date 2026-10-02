export type TrayShow = "all" | "picks" | "unused" | "used" | "worthy";

export interface TrayFilter {
  show: TrayShow;
  /** A photo category such as "PORTRAIT"; empty means every type. */
  category: string;
  /** Matched against the file name, ignoring case and surrounding spaces. */
  search: string;
}

export interface TrayPhotoFacts {
  id: string;
  fileName: string;
}

/** What the tray needs to know about each photo besides its name. */
export interface TrayContext {
  clientPickedIds: ReadonlySet<string>;
  usedPhotoIds: ReadonlySet<string>;
  categoryOf: (photoId: string) => string | undefined;
  isAlbumWorthy: (photoId: string) => boolean;
}

export const NO_TRAY_FILTER: TrayFilter = { show: "all", category: "", search: "" };

export function isFiltering(filter: TrayFilter): boolean {
  return filter.show !== "all" || filter.category !== "" || filter.search.trim() !== "";
}

/** All the conditions must hold at once: "client picks" and "portrait" narrows to both. Order is kept. */
export function filterTrayPhotos<T extends TrayPhotoFacts>(photos: T[], filter: TrayFilter, context: TrayContext): T[] {
  const needle = filter.search.trim().toLowerCase();
  return photos.filter((photo) => {
    const used = context.usedPhotoIds.has(photo.id);
    if (filter.show === "picks" && !context.clientPickedIds.has(photo.id)) return false;
    if (filter.show === "unused" && used) return false;
    if (filter.show === "used" && !used) return false;
    if (filter.show === "worthy" && !context.isAlbumWorthy(photo.id)) return false;
    if (filter.category && context.categoryOf(photo.id) !== filter.category) return false;
    if (needle && !photo.fileName.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/** How many photos each "Show" choice would list (before category and search), for the menu labels. */
export function countTrayPhotos(photos: TrayPhotoFacts[], context: TrayContext): Record<TrayShow, number> {
  const count: Record<TrayShow, number> = { all: photos.length, picks: 0, unused: 0, used: 0, worthy: 0 };
  for (const photo of photos) {
    if (context.clientPickedIds.has(photo.id)) count.picks++;
    if (context.usedPhotoIds.has(photo.id)) count.used++;
    else count.unused++;
    if (context.isAlbumWorthy(photo.id)) count.worthy++;
  }
  return count;
}
