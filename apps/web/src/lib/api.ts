import type {
  AlbumDTO,
  AlbumFormatDTO,
  AuthSession,
  CreateProjectInput,
  ProjectDTO,
  AlbumEditInput,
  ConfirmUploadInput,
  LayoutSuggestionDTO,
  LayoutTemplateDTO,
  LoginInput,
  PhotoAnalysisDTO,
  PhotoDTO,
  RegisterInput,
  RequestUploadInput,
  RequestUploadResponse,
} from "@albumflow/contracts";
import { loadSession } from "./auth-storage";
import { grantKindForPath, loadGrant, saveGrant } from "./client-grants";

// `||`, not `??`: a GitHub Actions secret that was never created (or left
// blank) still gets wired into the build as an empty string, not as
// genuinely absent — `??` only excuses null/undefined, so an empty string
// would silently defeat every one of these fallbacks and produce URLs like
// `/studios//projects`, an empty studio segment, rather than the demo default.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const DEMO_STUDIO_ID =
  import.meta.env.VITE_STUDIO_ID || "11111111-1111-4111-8111-111111111111";
export const DEMO_PROJECT_ID =
  import.meta.env.VITE_PROJECT_ID || "22222222-2222-4222-8222-222222222222";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const session = loadSession();
  if (session?.token) headers.set("Authorization", `Bearer ${session.token}`);
  // Client links protected by a password: send the proof of it entered earlier in this tab.
  const clientLink = grantKindForPath(path);
  const grant = clientLink && loadGrant(clientLink.kind, clientLink.token);
  if (grant) headers.set("X-Access-Grant", grant);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string; code?: string }
      | null;
    throw new ApiError(
      body?.message ?? `Request failed with ${response.status}`,
      response.status,
      body?.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --- Auth --------------------------------------------------------------

export function registerAccount(input: RegisterInput): Promise<AuthSession> {
  return request("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function login(input: LoginInput): Promise<AuthSession> {
  return request("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

// --- Projects --------------------------------------------------------------

export function listProjects(studioId: string): Promise<ProjectDTO[]> {
  return request(`/studios/${studioId}/projects`);
}

export function createProject(studioId: string, input: CreateProjectInput): Promise<ProjectDTO> {
  return request(`/studios/${studioId}/projects`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteProject(projectId: string): Promise<void> {
  return request(`/projects/${projectId}`, { method: "DELETE" });
}

export function getProject(projectId: string): Promise<ProjectDTO> {
  return request(`/projects/${projectId}`);
}

// --- Media ingestion -------------------------------------------------------

export function requestUpload(
  studioId: string,
  projectId: string,
  input: RequestUploadInput,
): Promise<RequestUploadResponse> {
  return request(`/studios/${studioId}/projects/${projectId}/photos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function putFileToStorage(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) throw new Error(`Upload to storage failed with ${response.status}`);
}

export function confirmUpload(photoId: string, input: ConfirmUploadInput = {}): Promise<PhotoDTO> {
  return request(`/photos/${photoId}/confirm-upload`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listProjectPhotos(projectId: string): Promise<PhotoDTO[]> {
  return request(`/projects/${projectId}/photos`);
}

// --- Photo intelligence ----------------------------------------------------

export function listProjectAnalyses(projectId: string): Promise<PhotoAnalysisDTO[]> {
  return request(`/projects/${projectId}/analyses`);
}

// --- Album composition -----------------------------------------------------


export function listLayoutTemplates(): Promise<LayoutTemplateDTO[]> {
  return request("/layout-templates");
}

export function suggestSpreadLayouts(
  projectId: string,
  photoIds: string[],
): Promise<LayoutSuggestionDTO[]> {
  return request(`/projects/${projectId}/spread-suggestions`, {
    method: "POST",
    body: JSON.stringify({ photoIds }),
  });
}

export function generateAlbum(
  projectId: string,
  input: { title?: string; targetSpreads?: number; format?: AlbumFormatDTO; photoIds?: string[] } = {},
): Promise<AlbumDTO> {
  return request(`/projects/${projectId}/albums`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listProjectAlbums(projectId: string): Promise<AlbumDTO[]> {
  return request(`/projects/${projectId}/albums`);
}

export function getAlbum(albumId: string): Promise<AlbumDTO> {
  return request(`/albums/${albumId}`);
}

export function editAlbum(albumId: string, command: AlbumEditInput): Promise<AlbumDTO> {
  return request(`/albums/${albumId}`, { method: "PATCH", body: JSON.stringify(command) });
}

export function deleteAlbum(albumId: string): Promise<void> {
  return request(`/albums/${albumId}`, { method: "DELETE" });
}

// --- Review ----------------------------------------------------------------

export interface ReviewSessionSummary {
  id: string;
  clientName: string;
  status: string;
  openComments: number;
  passwordProtected?: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface ReviewView {
  session: {
    id: string;
    clientName: string;
    status: string;
    expiresAt: string;
    comments: {
      id: string;
      spreadIndex: number;
      slotId?: string;
      body: string;
      authorName: string;
      resolved: boolean;
      createdAt: string;
    }[];
  };
  album: {
    id: string;
    title: string;
    status: string;
    format: { pageWidthMm: number; pageHeightMm: number; bleedMm: number };
    spreads: {
      templateId: string;
      placements: { slotId: string; photoId: string; previewUrl: string | null }[];
    }[];
  };
}

export function openReviewSession(
  albumId: string,
  clientName: string,
): Promise<{ sessionId: string; token: string; expiresAt: string; password?: string }> {
  return request(`/albums/${albumId}/review-sessions`, {
    method: "POST",
    body: JSON.stringify({ clientName }),
  });
}

/** The album review link and its password, readable again by the studio. */
export function getReviewAccess(albumId: string, sessionId: string): Promise<{ token: string; password: string }> {
  return request(`/albums/${albumId}/review-sessions/${sessionId}/access`);
}

/** Exchanges the password a client typed for a grant, remembered for this tab. Throws ApiError on a wrong password. */
export async function unlockClientLink(kind: "review" | "download" | "pick", token: string, password: string): Promise<void> {
  const { grant } = await request<{ grant: string }>(`/${kind}/${token}/unlock`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  saveGrant(kind, token, grant);
}

export function listReviewSessions(albumId: string): Promise<ReviewSessionSummary[]> {
  return request(`/albums/${albumId}/review-sessions`);
}

export interface FeedbackComment {
  id: string;
  sessionId: string;
  clientName: string;
  spreadIndex: number;
  slotId?: string | undefined;
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface AlbumFeedback {
  albumId: string;
  comments: FeedbackComment[];
  openCount: number;
  resolvedCount: number;
  sessions: ReviewSessionSummary[];
}

/** What the clients actually wrote, for the photographer who has to act on it. */
export function getAlbumFeedback(albumId: string): Promise<AlbumFeedback> {
  return request(`/albums/${albumId}/comments`);
}

export function resolveComment(albumId: string, commentId: string): Promise<AlbumFeedback> {
  return request(`/albums/${albumId}/comments/${commentId}/resolve`, { method: "POST" });
}

export function getReview(token: string): Promise<ReviewView> {
  return request(`/review/${token}`);
}

export function addReviewComment(
  token: string,
  input: { spreadIndex: number; slotId?: string; body: string },
): Promise<ReviewView> {
  return request(`/review/${token}/comments`, { method: "POST", body: JSON.stringify(input) });
}

export function submitReviewDecision(
  token: string,
  decision: "APPROVED" | "CHANGES_REQUESTED",
): Promise<ReviewView> {
  return request(`/review/${token}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

// --- Export ----------------------------------------------------------------

export interface ExportJobDTO {
  id: string;
  albumId: string;
  printProfileId: string;
  status: "QUEUED" | "RENDERING" | "READY" | "FAILED";
  byteSize: number | null;
  pageCount: number | null;
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface PrintProfileDTO {
  id: string;
  name: string;
  dpi: number;
  bleedMm: number;
  /** Safe area inset from the trim edge where nothing important should sit. */
  safeMarginMm: number;
  drawTrimMarks: boolean;
}

export function listPrintProfiles(): Promise<PrintProfileDTO[]> {
  return request("/print-profiles");
}

export function requestExport(albumId: string, printProfileId?: string): Promise<ExportJobDTO> {
  return request(`/albums/${albumId}/exports`, {
    method: "POST",
    body: JSON.stringify(printProfileId ? { printProfileId } : {}),
  });
}

export function listExports(albumId: string): Promise<ExportJobDTO[]> {
  return request(`/albums/${albumId}/exports`);
}

export function getExportDownload(exportJobId: string): Promise<{ url: string }> {
  return request(`/exports/${exportJobId}/download`);
}

export function deleteExport(exportJobId: string): Promise<void> {
  return request(`/exports/${exportJobId}`, { method: "DELETE" });
}

// --- Studio & billing ------------------------------------------------------

export interface StudioOverview {
  studio: { id: string; name: string; ownerEmail: string; createdAt: string };
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    albumsUsed: number;
    albumsIncluded: number | null;
    albumsRemaining: number | null;
    seatsUsed: number;
    seatsIncluded: number | null;
    periodStart: string;
    periodEnd: string;
    watermarkDrafts: boolean;
  };
  members: { id: string; name: string; email: string; role: string; accepted: boolean }[];
}

export function getStudioOverview(studioId: string): Promise<StudioOverview> {
  return request(`/studios/${studioId}`);
}

export function inviteMember(
  studioId: string,
  input: { email: string; name: string; role: "OWNER" | "EDITOR" | "VIEWER" },
): Promise<{ memberId: string }> {
  return request(`/studios/${studioId}/members`, { method: "POST", body: JSON.stringify(input) });
}

export function removeMember(studioId: string, memberId: string): Promise<void> {
  return request(`/studios/${studioId}/members/${memberId}`, { method: "DELETE" });
}

export function changePlan(studioId: string, planCode: string): Promise<StudioOverview> {
  return request(`/studios/${studioId}/plan`, {
    method: "PUT",
    body: JSON.stringify({ planCode }),
  });
}

// --- AI status ---------------------------------------------------------

export interface AiStatus {
  /** Whether the configured photo-analysis AI (e.g. the local Ollama server) is reachable right now. */
  available: boolean;
}

export function getAiStatus(): Promise<AiStatus> {
  return request("/ai/status");
}

// --- Client photo selection ("picks") ---------------------------------------

export interface PickSessionSummary {
  id: string;
  clientName: string;
  status: "OPEN" | "SUBMITTED" | "REVOKED";
  pickLimit: number | null;
  passwordProtected?: boolean;
  pickedCount: number;
  pickedPhotoIds: string[];
  submittedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export function openPickSession(
  projectId: string,
  input: { clientName: string; pickLimit?: number },
): Promise<{ sessionId: string; token: string; expiresAt: string; password?: string }> {
  return request(`/projects/${projectId}/pick-sessions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listPickSessions(projectId: string): Promise<PickSessionSummary[]> {
  return request(`/projects/${projectId}/pick-sessions`);
}

/** The selection link and its password, readable again by the studio. */
export function getPickAccess(projectId: string, sessionId: string): Promise<{ token: string; password: string }> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/access`);
}

export function reopenPickSession(projectId: string, sessionId: string): Promise<PickSessionSummary> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/reopen`, { method: "POST" });
}

export function revokePickSession(projectId: string, sessionId: string): Promise<PickSessionSummary> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/revoke`, { method: "POST" });
}

export interface PickState {
  id: string;
  clientName: string;
  status: "OPEN" | "SUBMITTED" | "REVOKED";
  pickLimit: number | null;
  pickedPhotoIds: string[];
  expiresAt: string;
}

export interface PickView {
  session: PickState;
  projectName: string;
  photos: { id: string; fileName: string; previewUrl: string; thumbnailUrl: string }[];
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

export function submitPicks(token: string): Promise<PickState> {
  return request(`/pick/${token}/submit`, { method: "POST" });
}

// --- Client delivery (download links) ----------------------------------------

export interface DownloadSessionSummary {
  id: string;
  clientName: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  passwordProtected?: boolean;
  downloadCount: number;
  firstDownloadedAt: string | null;
  lastDownloadedAt: string | null;
  expiresAt: string;
  daysLeft: number;
  createdAt: string;
}

export function openDownloadSession(
  projectId: string,
  input: { clientName: string; ttlDays?: number },
): Promise<{
  sessionId: string;
  token: string;
  expiresAt: string;
  photoCount: number;
  missingCount: number;
  password?: string;
}> {
  return request(`/projects/${projectId}/download-sessions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listDownloadSessions(projectId: string): Promise<DownloadSessionSummary[]> {
  return request(`/projects/${projectId}/download-sessions`);
}

/** The download link and its password, readable again by the studio. */
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
  photos: { id: string; fileName: string; previewUrl: string; thumbnailUrl: string }[];
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
