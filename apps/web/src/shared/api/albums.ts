import type {
  AlbumDTO,
  AlbumFormatDTO,
  AlbumEditInput,
  LayoutSuggestionDTO,
  LayoutTemplateDTO,
} from "@albumflow/contracts";
import { request } from "./http";

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
