import { request } from "./http";

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
