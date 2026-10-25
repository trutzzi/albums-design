import type { ClientBrandingDTO, GalleryOverride } from "@albumflow/contracts";
import { loadGrant } from "@/shared/lib/client-grants";
import { API_URL, request } from "./http";
import type { InvitationInput, InvitationOutcome } from "./review";
import type { ClientGalleryPhoto } from "./picks";

// --- Client delivery (download links) ----------------------------------------

export interface DownloadSessionSummary {
  id: string;
  clientName: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  passwordProtected?: boolean;
  downloadCount: number;
  firstDownloadedAt: string | null;
  lastDownloadedAt: string | null;
  lastSentTo?: string | null;
  lastSentAt?: string | null;
  expiresAt: string;
  daysLeft: number;
  createdAt: string;
  /** The cover the photographer chose for the client gallery; null when it is chosen automatically. */
  coverPhotoId?: string | null;
  /** This gallery's own look (Studio Pro); null when it follows the studio's style. */
  lookOverride?: GalleryOverride | null;
}

export function openDownloadSession(
  projectId: string,
  input: { clientName: string; ttlDays?: number } & InvitationInput,
): Promise<
  {
    sessionId: string;
    token: string;
    expiresAt: string;
    photoCount: number;
    missingCount: number;
    password?: string;
  } & InvitationOutcome
> {
  return request(`/projects/${projectId}/download-sessions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listDownloadSessions(projectId: string): Promise<DownloadSessionSummary[]> {
  return request(`/projects/${projectId}/download-sessions`);
}

/** The download link and its password, readable again by the studio. */
export function sendDownloadInvitation(
  projectId: string,
  sessionId: string,
  input: { email?: string; language?: "en" | "ro" } = {},
): Promise<DownloadSessionSummary> {
  return request(`/projects/${projectId}/download-sessions/${sessionId}/send`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDownloadAccess(projectId: string, sessionId: string): Promise<{ token: string; password: string }> {
  return request(`/projects/${projectId}/download-sessions/${sessionId}/access`);
}

/** `null` lets the gallery choose its cover again. */
export function chooseDownloadCover(
  projectId: string,
  sessionId: string,
  photoId: string | null,
): Promise<DownloadSessionSummary> {
  return request(`/projects/${projectId}/download-sessions/${sessionId}/cover`, {
    method: "PUT",
    body: JSON.stringify({ photoId }),
  });
}

/** `null` makes the gallery follow the studio's style again. */
export function restyleDownloadGallery(
  projectId: string,
  sessionId: string,
  override: GalleryOverride | null,
): Promise<DownloadSessionSummary> {
  return request(`/projects/${projectId}/download-sessions/${sessionId}/look`, {
    method: "PUT",
    body: JSON.stringify({ override }),
  });
}

export function revokeDownloadSession(projectId: string, sessionId: string): Promise<DownloadSessionSummary> {
  return request(`/projects/${projectId}/download-sessions/${sessionId}/revoke`, { method: "POST" });
}

export interface DownloadView {
  clientName: string;
  projectName: string;
  photoCount: number;
  missingCount: number;
  totalBytes: number;
  expiresAt: string;
  daysLeft: number;
  /** Display copies to browse before downloading, each in its chapter (a photo category) when it has one. */
  photos: (ClientGalleryPhoto & { section: string | null })[];
  /** The gallery's chapters in the order of the day, e.g. `PREPARATION`, `CEREMONY`. */
  sections: string[];
  coverPhotoId: string | null;
  /** What the client picked in the selection step. */
  favoritePhotoIds: string[];
  eventDate: string | null;
  /** Photos still being prepared for the gallery (they are in the download regardless). */
  processingCount: number;
  branding: ClientBrandingDTO | null;
}

export function getDownloadView(token: string): Promise<DownloadView> {
  return request(`/download/${token}`);
}

/** What a locked download link shows before its password: the studio, and whether a cover teaser exists. */
export interface DownloadGate {
  studioName: string | null;
  accent: string | null;
  teaser: boolean;
}

export function getDownloadGate(token: string): Promise<DownloadGate> {
  return request(`/download/${token}/gate`);
}

/** The cover shrunk to a few dozen pixels; the gate blurs it behind the form. */
export function downloadTeaserUrl(token: string): string {
  return `${API_URL}/download/${token}/teaser.jpg`;
}

/** Which photos the ZIP holds: everything, the client's favourites, or one chapter. */
export type DownloadScope = { kind: "all" } | { kind: "favorites" } | { kind: "section"; section: string };

/** A plain link the browser follows, so the file streams straight to disk instead of through the page. */
export function downloadZipUrl(token: string, scope: DownloadScope = { kind: "all" }): string {
  const params = new URLSearchParams();
  if (scope.kind !== "all") params.set("scope", scope.kind);
  if (scope.kind === "section") params.set("section", scope.section);
  // A plain link cannot send a header, so a protected link's grant travels in the URL.
  const grant = loadGrant("download", token);
  if (grant) params.set("grant", grant);
  const query = params.toString();
  return `${API_URL}/download/${token}/photos.zip${query ? `?${query}` : ""}`;
}
