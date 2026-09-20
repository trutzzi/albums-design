import { z } from "zod";

export const projectTypeSchema = z.enum(["WEDDING", "BAPTISM", "EVENT"]);
export type ProjectType = z.infer<typeof projectTypeSchema>;

/** Who the shoot is for. Optional, and remembered so client links prefill instead of asking again. */
export const clientContactSchema = z.object({
  clientName: z.string().trim().max(255).optional(),
  clientEmail: z.string().trim().email().max(320).optional(),
});

export const createProjectSchema = z
  .object({
    name: z.string().min(1).max(255),
    type: projectTypeSchema.default("WEDDING"),
    eventDate: z.string().datetime().optional(),
  })
  .merge(clientContactSchema);
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const projectDtoSchema = z.object({
  id: z.string().uuid(),
  studioId: z.string().uuid(),
  name: z.string(),
  type: projectTypeSchema,
  eventDate: z.string().datetime().nullable(),
  clientName: z.string().nullable(),
  clientEmail: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ProjectDTO = z.infer<typeof projectDtoSchema>;

/** A shoot as the list shows it: enough to recognise the card without opening it. */
export const projectSummaryDtoSchema = projectDtoSchema.extend({
  photoCount: z.number().int().min(0),
  albumCount: z.number().int().min(0),
  coverThumbnailUrl: z.string().nullable(),
});
export type ProjectSummaryDTO = z.infer<typeof projectSummaryDtoSchema>;

// --- Auth ---------------------------------------------------------------

export const registerInputSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(255),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const authSessionSchema = z.object({
  token: z.string(),
  studioId: z.string().uuid(),
  name: z.string(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;
