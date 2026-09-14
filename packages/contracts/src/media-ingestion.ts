import { z } from "zod";

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
] as const;

/** Ceiling for a single original. Servers must size their body limits from this. */
export const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;

export const requestUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(SUPPORTED_MIME_TYPES),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, "Files over 75MB are not accepted."),
});
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export const requestUploadResponseSchema = z.object({
  photoId: z.string().uuid(),
  uploadUrl: z.string().url(),
  storageKey: z.string(),
  expiresInSeconds: z.number().int().positive(),
});
export type RequestUploadResponse = z.infer<typeof requestUploadResponseSchema>;

export const confirmUploadSchema = z.object({
  checksum: z.string().min(32).optional(),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

export const photoStatusSchema = z.enum([
  "PENDING_UPLOAD",
  "UPLOADED",
  "ANALYSIS_QUEUED",
  "ANALYSED",
  "FAILED",
]);
export type PhotoStatus = z.infer<typeof photoStatusSchema>;

export const photoDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  fileName: z.string(),
  status: photoStatusSchema,
  storageKey: z.string(),
  byteSize: z.number().int().positive(),
  createdAt: z.string().datetime(),
  previewUrl: z.string().nullable(),
});
export type PhotoDTO = z.infer<typeof photoDtoSchema>;
