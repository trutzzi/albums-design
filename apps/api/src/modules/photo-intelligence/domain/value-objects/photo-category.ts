export const PHOTO_CATEGORIES = [
  "PREPARATION",
  "CEREMONY",
  "PORTRAIT",
  "COUPLE",
  "GROUP",
  "DETAIL",
  "VENUE",
  "RECEPTION",
  "CANDID",
] as const;

export type PhotoCategoryName = (typeof PHOTO_CATEGORIES)[number];

/** Categories that carry a chapter of the story — used to seed album sections. */
export const NARRATIVE_CATEGORIES: readonly PhotoCategoryName[] = [
  "PREPARATION",
  "CEREMONY",
  "PORTRAIT",
  "COUPLE",
  "GROUP",
  "RECEPTION",
];

export function isNarrativeCategory(category: PhotoCategoryName): boolean {
  return NARRATIVE_CATEGORIES.includes(category);
}
