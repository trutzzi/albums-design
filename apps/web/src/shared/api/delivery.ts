import type { ClientBrandingDTO } from "@albumflow/contracts";
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
  /** Display copies to browse before downloading. */
  photos: ClientGalleryPhoto[];
  /** Photos still being prepared for the gallery (they are in the download regardless). */
  processingCount: number;
  branding: ClientBrandingDTO | null;
}

export function getDownloadView(token: string): Promise<DownloadView> {
  return request(`/download/${token}`);
}

/** A plain link the browser follows, so the file streams straight to disk instead of through the page. */
export function downloadZipUrl(token: string): string {
  // A plain link cannot send a header, so a protected link's grant travels in the URL.
  const grant = loadGrant("download", token);
  return `${API_URL}/download/${token}/photos.zip${grant ? `?grant=${encodeURIComponent(grant)}` : ""}`;
}
