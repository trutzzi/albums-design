import { request } from "./http";

// --- Export ----------------------------------------------------------------

/** A print PDF, or one JPG per spread in a ZIP for labs that only take images. */
export type ExportFormat = "PDF" | "JPG_ZIP";

export interface ExportJobDTO {
  id: string;
  albumId: string;
  printProfileId: string;
  format: ExportFormat;
  status: "QUEUED" | "RENDERING" | "READY" | "FAILED";
  byteSize: number | null;
  pageCount: number | null;
  /** The page size the PDF was made at; null for PDFs made before this was recorded. */
  pageWidthMm: number | null;
  pageHeightMm: number | null;
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

export function requestExport(
  albumId: string,
  options: { printProfileId?: string; format?: ExportFormat } = {},
): Promise<ExportJobDTO> {
  return request(`/albums/${albumId}/exports`, { method: "POST", body: JSON.stringify(options) });
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
