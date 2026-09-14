import { z } from "zod";

export const cropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
});
export type Crop = z.infer<typeof cropSchema>;

export const photoTreatmentSchema = z.enum(["COLOR", "BLACK_WHITE"]);
export type PhotoTreatment = z.infer<typeof photoTreatmentSchema>;

export const slotFrameSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
});
export type SlotFrame = z.infer<typeof slotFrameSchema>;

export const placementSchema = z.object({
  slotId: z.string(),
  photoId: z.string(),
  crop: cropSchema,
  treatment: photoTreatmentSchema.default("COLOR"),
  /** Absent means the template's own slot rectangle. */
  frame: slotFrameSchema.optional(),
});
export type PlacementDTO = z.infer<typeof placementSchema>;

export const spreadSchema = z.object({
  templateId: z.string(),
  placements: z.array(placementSchema),
});
export type SpreadDTO = z.infer<typeof spreadSchema>;

export const albumStatusSchema = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "EXPORTED",
]);
export type AlbumStatus = z.infer<typeof albumStatusSchema>;

export const albumFormatSchema = z.object({
  pageWidthMm: z.number().positive(),
  pageHeightMm: z.number().positive(),
  bleedMm: z.number().min(0),
});
export type AlbumFormatDTO = z.infer<typeof albumFormatSchema>;

export const albumDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  status: albumStatusSchema,
  format: albumFormatSchema,
  spreads: z.array(spreadSchema),
  spreadCount: z.number().int(),
  pageCount: z.number().int(),
  photoCount: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type AlbumDTO = z.infer<typeof albumDtoSchema>;

export const generateAlbumSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  targetSpreads: z.number().int().min(1).max(60).optional(),
  format: albumFormatSchema.optional(),
});
export type GenerateAlbumInput = z.infer<typeof generateAlbumSchema>;

export const albumEditSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("RENAME"), title: z.string().min(1).max(255) }),
  z.object({
    type: z.literal("REORDER_SPREAD"),
    fromIndex: z.number().int().min(0),
    toIndex: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("SWAP_PHOTO"),
    spreadIndex: z.number().int().min(0),
    slotId: z.string(),
    photoId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("SET_CROP"),
    spreadIndex: z.number().int().min(0),
    slotId: z.string(),
    crop: cropSchema,
  }),
  z.object({
    type: z.literal("CHANGE_TEMPLATE"),
    spreadIndex: z.number().int().min(0),
    templateId: z.string(),
    /** Slot order. Omit to carry the current photos over in reading order. */
    photoIds: z.array(z.string().uuid()).optional(),
  }),
  z.object({
    type: z.literal("ADD_SPREAD"),
    atIndex: z.number().int().min(0),
    templateId: z.string(),
    photoIds: z.array(z.string().uuid()),
  }),
  z.object({
    type: z.literal("SET_TREATMENT"),
    spreadIndex: z.number().int().min(0),
    slotId: z.string(),
    treatment: photoTreatmentSchema,
  }),
  z.object({
    type: z.literal("SET_SPREAD_TREATMENT"),
    spreadIndex: z.number().int().min(0),
    treatment: photoTreatmentSchema,
  }),
  z.object({
    type: z.literal("SWAP_PLACEMENTS"),
    spreadIndex: z.number().int().min(0),
    slotIdA: z.string(),
    slotIdB: z.string(),
  }),
  z.object({
    type: z.literal("SET_FRAME"),
    spreadIndex: z.number().int().min(0),
    slotId: z.string(),
    frame: slotFrameSchema,
  }),
  z.object({ type: z.literal("RESET_FRAMES"), spreadIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("REMOVE_SPREAD"), index: z.number().int().min(0) }),
  z.object({ type: z.literal("SUBMIT_FOR_REVIEW") }),
  z.object({ type: z.literal("REOPEN") }),
]);
export type AlbumEditInput = z.infer<typeof albumEditSchema>;

export const templateSlotSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  prefers: z.enum(["LANDSCAPE", "PORTRAIT", "SQUARE", "ANY"]),
});

export const layoutTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  fullBleed: z.boolean(),
  slots: z.array(templateSlotSchema),
});
export type LayoutTemplateDTO = z.infer<typeof layoutTemplateSchema>;

export const photoAnalysisDtoSchema = z.object({
  photoId: z.string().uuid(),
  overall: z.number().int(),
  components: z.object({
    sharpness: z.number().int(),
    exposure: z.number().int(),
    composition: z.number().int(),
    faceQuality: z.number().int(),
  }),
  category: z.string(),
  categoryConfidence: z.number(),
  orientation: z.enum(["LANDSCAPE", "PORTRAIT", "SQUARE"]),
  faceCount: z.number().int(),
  albumWorthy: z.boolean(),
});
export type PhotoAnalysisDTO = z.infer<typeof photoAnalysisDtoSchema>;

/** A spread holds up to a nine-photo contact sheet. */
export const MAX_PHOTOS_PER_SPREAD = 9;

export const suggestLayoutsSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1).max(MAX_PHOTOS_PER_SPREAD),
});
export type SuggestLayoutsInput = z.infer<typeof suggestLayoutsSchema>;

export const layoutSuggestionSchema = z.object({
  templateId: z.string(),
  name: z.string(),
  photoIds: z.array(z.string()),
  fitScore: z.number(),
});
export type LayoutSuggestionDTO = z.infer<typeof layoutSuggestionSchema>;
