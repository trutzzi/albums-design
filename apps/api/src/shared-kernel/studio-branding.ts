import type { ClientBrandingDTO } from "@albumflow/contracts";

/**
 * The studio's own name, colour and logo for a shoot's client pages — or `null` when the
 * studio's plan does not include branding (the pages then look like AlbumFlow).
 */
export interface StudioBrandingDirectory {
  forProject(projectId: string): Promise<ClientBrandingDTO | null>;
}
