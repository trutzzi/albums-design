import type {
  CreateProjectInput,
  ProjectDTO,
  ProjectSummaryDTO,
  ConfirmUploadInput,
  PhotoAnalysisDTO,
  PhotoDTO,
  RequestUploadInput,
  RequestUploadResponse,
} from "@albumflow/contracts";
import { request } from "./http";

// --- Projects --------------------------------------------------------------

export function listProjects(studioId: string): Promise<ProjectSummaryDTO[]> {
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

export async function putFileToStorage(uploadUrl: string, file: File, signal?: AbortSignal): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Upload to storage failed with ${response.status}`);
}

/**
 * Throws away a photo whose upload never finished — the rows a cancelled batch leaves
 * behind. The server refuses for anything already confirmed.
 */
export function abandonUpload(photoId: string): Promise<void> {
  return request(`/photos/${photoId}`, { method: "DELETE" });
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

/** Queues the shoot's photos whose analysis failed for another try; returns how many were queued. */
export function retryFailedAnalyses(projectId: string): Promise<{ queued: number }> {
  return request(`/projects/${projectId}/photos/retry-analysis`, { method: "POST" });
}

// --- Photo intelligence ----------------------------------------------------

export function listProjectAnalyses(projectId: string): Promise<PhotoAnalysisDTO[]> {
  return request(`/projects/${projectId}/analyses`);
}
