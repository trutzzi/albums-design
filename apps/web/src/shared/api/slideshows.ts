import type { ClientBrandingDTO } from "@albumflow/contracts";
import { request } from "./http";
import type { InvitationInput, InvitationOutcome } from "./review";
import type { ClientGalleryPhoto } from "./picks";

// --- Client slideshows ---------------------------------------------------------

export type SlideshowSource = "PICKS" | "ALBUM" | "SHOOT";
export type SlideshowTransition = "FADE" | "NONE";

export interface SlideshowSettings {
  intervalSeconds: number;
  transition: SlideshowTransition;
}

export interface SlideshowSessionSummary {
  id: string;
  clientName: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  source: SlideshowSource;
  albumId: string | null;
  photoCount: number;
  intervalSeconds: number;
  transition: SlideshowTransition;
  viewCount: number;
  lastViewedAt: string | null;
  lastSentTo: string | null;
  lastSentAt: string | null;
  expiresAt: string;
  daysLeft: number;
  createdAt: string;
}

export function openSlideshowSession(
  projectId: string,
  input: {
    clientName: string;
    source: SlideshowSource;
    albumId?: string;
    ttlDays?: number;
    intervalSeconds?: number;
    transition?: SlideshowTransition;
  } & InvitationInput,
): Promise<{ sessionId: string; token: string; expiresAt: string; photoCount: number } & InvitationOutcome> {
  return request(`/projects/${projectId}/slideshow-sessions`, { method: "POST", body: JSON.stringify(input) });
}

export function listSlideshowSessions(projectId: string): Promise<SlideshowSessionSummary[]> {
  return request(`/projects/${projectId}/slideshow-sessions`);
}

export function getSlideshowAccess(projectId: string, sessionId: string): Promise<{ token: string }> {
  return request(`/projects/${projectId}/slideshow-sessions/${sessionId}/access`);
}

export function sendSlideshowInvitation(
  projectId: string,
  sessionId: string,
  input: { email?: string; language?: "en" | "ro" } = {},
): Promise<SlideshowSessionSummary> {
  return request(`/projects/${projectId}/slideshow-sessions/${sessionId}/send`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSlideshowSettings(
  projectId: string,
  sessionId: string,
  settings: Partial<SlideshowSettings>,
): Promise<SlideshowSessionSummary> {
  return request(`/projects/${projectId}/slideshow-sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export function refreshSlideshowPhotos(projectId: string, sessionId: string): Promise<SlideshowSessionSummary> {
  return request(`/projects/${projectId}/slideshow-sessions/${sessionId}/refresh`, { method: "POST" });
}

export function extendSlideshowSession(projectId: string, sessionId: string): Promise<SlideshowSessionSummary> {
  return request(`/projects/${projectId}/slideshow-sessions/${sessionId}/extend`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function revokeSlideshowSession(projectId: string, sessionId: string): Promise<SlideshowSessionSummary> {
  return request(`/projects/${projectId}/slideshow-sessions/${sessionId}/revoke`, { method: "POST" });
}

export interface SlideshowView {
  clientName: string;
  projectName: string;
  branding: ClientBrandingDTO | null;
  settings: SlideshowSettings;
  /** Display copies in play order. Their URLs expire after an hour, so a long-running page refetches. */
  photos: ClientGalleryPhoto[];
  expiresAt: string;
}

export function getSlideshowView(token: string): Promise<SlideshowView> {
  return request(`/slideshow/${token}`);
}

/** Once per opening of the page; refetches are deliberately not views. */
export function recordSlideshowView(token: string): Promise<void> {
  return request(`/slideshow/${token}/viewed`, { method: "POST" });
}
