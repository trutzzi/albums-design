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
  /** The language of the confirmation email. */
  language: z.enum(["en", "ro"]).optional(),
  /** A field people never see: only bots fill it in. */
  website: z.string().max(255).optional(),
  /** The Cloudflare Turnstile token, when the human check is switched on. */
  captchaToken: z.string().max(4096).optional(),
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

/**
 * How a studio presents itself to its clients on review, selection and download pages
 * (Studio Pro): its own name, accent colour and logo instead of AlbumFlow's.
 */
export const studioBrandingSchema = z.object({
  displayName: z.string().trim().max(80),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours are #rrggbb.").nullable(),
  /** A data: URL; the server shrinks it to a small PNG before storing it. `null` removes the logo. */
  logo: z.string().max(3_000_000).nullable(),
});
export type StudioBrandingInput = z.infer<typeof studioBrandingSchema>;

/** What a client page receives: present only when the studio's plan includes branding. */
export interface ClientBrandingDTO {
  name: string;
  accent: string | null;
  logo: string | null;
}
