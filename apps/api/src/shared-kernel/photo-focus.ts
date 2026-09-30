import type { PhotoFocus } from "@albumflow/contracts";

/**
 * Where each photo's subject sits, for the modules that frame photos (the client proof,
 * the PDF export) without knowing anything about how photos are analysed.
 */
export interface PhotoFocusDirectory {
  forProject(projectId: string): Promise<Map<string, PhotoFocus>>;
}
