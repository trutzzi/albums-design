import { z } from "zod";

export const projectTypeSchema = z.enum(["WEDDING", "BAPTISM", "EVENT"]);
export type ProjectType = z.infer<typeof projectTypeSchema>;

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  type: projectTypeSchema.default("WEDDING"),
  eventDate: z.string().datetime().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const projectDtoSchema = z.object({
  id: z.string().uuid(),
  studioId: z.string().uuid(),
  name: z.string(),
  type: projectTypeSchema,
  eventDate: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ProjectDTO = z.infer<typeof projectDtoSchema>;
