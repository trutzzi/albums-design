import type { ClientBrandingDTO } from "@albumflow/contracts";
import { request } from "./http";
import type { InvitationInput, InvitationOutcome } from "./review";

// --- Client photo selection ("picks") ---------------------------------------

export interface PickSessionSummary {
  id: string;
  clientName: string;
  status: "OPEN" | "SUBMITTED" | "REVOKED";
  pickLimit: number | null;
  passwordProtected?: boolean;
  /** Which of the two picking steps the client is on. */
  stage: "SHORTLIST" | "FINAL";
  /** Step 1: how many they marked as possibilities. */
  shortlistedCount: number;
  /** Step 2: how many they finally chose. */
  pickedCount: number;
  pickedPhotoIds: string[];
  submittedAt: string | null;
  lastSentTo?: string | null;
  lastSentAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

export function openPickSession(
  projectId: string,
  input: { clientName: string; pickLimit?: number } & InvitationInput,
): Promise<{ sessionId: string; token: string; expiresAt: string; password?: string } & InvitationOutcome> {
  return request(`/projects/${projectId}/pick-sessions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listPickSessions(projectId: string): Promise<PickSessionSummary[]> {
  return request(`/projects/${projectId}/pick-sessions`);
}

/** The selection link and its password, readable again by the studio. */
export function sendPickInvitation(
  projectId: string,
  sessionId: string,
  input: { email?: string; language?: "en" | "ro" } = {},
): Promise<PickSessionSummary> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/send`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPickAccess(projectId: string, sessionId: string): Promise<{ token: string; password: string }> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/access`);
}

export function reopenPickSession(projectId: string, sessionId: string): Promise<PickSessionSummary> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/reopen`, { method: "POST" });
}

export function revokePickSession(projectId: string, sessionId: string): Promise<PickSessionSummary> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/revoke`, { method: "POST" });
}

export type PickStage = "SHORTLIST" | "FINAL";

export interface PickState {
  id: string;
  clientName: string;
  status: "OPEN" | "SUBMITTED" | "REVOKED";
  /** Step 1 marks possibilities, step 2 narrows them to the photographer's limit. */
  stage: PickStage;
  pickLimit: number | null;
  shortlistedPhotoIds: string[];
  pickedPhotoIds: string[];
  expiresAt: string;
}

/** A photo in a client gallery: display copies only, plus its upright size (null until analysed). */
export interface ClientGalleryPhoto {
  id: string;
  fileName: string;
  previewUrl: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
}

export interface PickView {
  session: PickState;
  projectName: string;
  photos: ClientGalleryPhoto[];
  /** Photos still being prepared; the gallery grows as they finish. */
  processingCount: number;
  branding: ClientBrandingDTO | null;
}

export function getPickView(token: string): Promise<PickView> {
  return request(`/pick/${token}`);
}

export function setPhotoPicked(token: string, photoId: string, picked: boolean): Promise<PickState> {
  return request(`/pick/${token}/photos/${photoId}`, {
    method: "PUT",
    body: JSON.stringify({ picked }),
  });
}

/** Move the client between step 1 (shortlist) and step 2 (final selection). */
export function setPickStage(token: string, stage: PickStage): Promise<PickState> {
  return request(`/pick/${token}/stage`, { method: "POST", body: JSON.stringify({ stage }) });
}

export function submitPicks(token: string): Promise<PickState> {
  return request(`/pick/${token}/submit`, { method: "POST" });
}
