/** What the analysis concluded about one photo: its story category and its overall quality (0–100). */
export interface PhotoTraits {
  /** One of photo intelligence's categories, e.g. `CEREMONY` — kept a string so readers need not import that context. */
  category: string;
  score: number;
}

/**
 * Each photo's category and score, for client pages that group photos into chapters
 * or choose a cover without knowing how photos are analysed. Photos not analysed yet are absent.
 */
export interface PhotoTraitsDirectory {
  forProject(projectId: string): Promise<Map<string, PhotoTraits>>;
}
