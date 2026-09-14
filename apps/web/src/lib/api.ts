import type {
  AlbumDTO,
  CreateProjectInput,
  ProjectDTO,
  AlbumEditInput,
  ConfirmUploadInput,
  LayoutSuggestionDTO,
  LayoutTemplateDTO,
  PhotoAnalysisDTO,
  PhotoDTO,
  RequestUploadInput,
  RequestUploadResponse,
} from "@albumflow/contracts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const STUDIO_API_KEY = import.meta.env.VITE_STUDIO_API_KEY ?? "";

export const DEMO_STUDIO_ID =
  import.meta.env.VITE_STUDIO_ID ?? "11111111-1111-4111-8111-111111111111";
export const DEMO_PROJECT_ID =
  import.meta.env.VITE_PROJECT_ID ?? "22222222-2222-4222-8222-222222222222";

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
  if (STUDIO_API_KEY) headers.set("Authorization", `Bearer ${STUDIO_API_KEY}`);

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
  input: { title?: string; targetSpreads?: number } = {},
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

// --- Review ----------------------------------------------------------------

export interface ReviewSessionSummary {
  id: string;
  clientName: string;
  status: string;
  openComments: number;
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
): Promise<{ sessionId: string; token: string; expiresAt: string }> {
  return request(`/albums/${albumId}/review-sessions`, {
    method: "POST",
    body: JSON.stringify({ clientName }),
  });
}

export function listReviewSessions(albumId: string): Promise<ReviewSessionSummary[]> {
  return request(`/albums/${albumId}/review-sessions`);
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
