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

/** Relative type sizes; the physical size scales with the page (see TEXT_SIZE_RATIO). */
export const textSizeSchema = z.enum(["caption", "body", "heading", "title"]);
export type TextSize = z.infer<typeof textSizeSchema>;

export const albumFontSchema = z.enum(["serif", "sans"]);
export type AlbumFont = z.infer<typeof albumFontSchema>;

/**
 * Words on a spread — a title page, a date, a line of vows. Positioned like a slot,
 * as fractions of the whole spread with a top-left origin, so the editor, the client
 * proof and the PDF all place it identically.
 */
export const textBlockSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(2000),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.02).max(1),
  height: z.number().min(0.02).max(1),
  size: textSizeSchema,
  align: z.enum(["left", "center", "right"]),
  /** Absent means the album style's font. */
  font: albumFontSchema.optional(),
});
export type TextBlockDTO = z.infer<typeof textBlockSchema>;

export const spreadSchema = z.object({
  templateId: z.string(),
  placements: z.array(placementSchema),
  /** Absent on albums made before text existed — the same as none. */
  texts: z.array(textBlockSchema).optional(),
  /** A finished spread: shuffling and layout changes leave it exactly as it is. */
  locked: z.boolean().optional(),
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

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours are #rrggbb.");

/**
 * How the whole album looks: the paper colour, how much air sits around the photos,
 * a thin keyline around each photo, and the typeface for its words.
 */
export const albumStyleSchema = z.object({
  preset: z.enum(["classic", "modern", "fine-art", "midnight", "custom"]),
  background: hexColor,
  spacing: z.enum(["classic", "airy"]),
  keyline: z.boolean(),
  font: albumFontSchema,
});
export type AlbumStyleDTO = z.infer<typeof albumStyleSchema>;

export const STYLE_PRESETS: Record<Exclude<AlbumStyleDTO["preset"], "custom">, AlbumStyleDTO> = {
  classic: { preset: "classic", background: "#ffffff", spacing: "classic", keyline: false, font: "serif" },
  modern: { preset: "modern", background: "#ffffff", spacing: "classic", keyline: false, font: "sans" },
  "fine-art": { preset: "fine-art", background: "#f4f0e8", spacing: "airy", keyline: true, font: "serif" },
  midnight: { preset: "midnight", background: "#1b1c1f", spacing: "classic", keyline: false, font: "sans" },
};

/** Albums made before styles existed look exactly as they always did. */
export const DEFAULT_STYLE: AlbumStyleDTO = STYLE_PRESETS.classic;

/** The front cover, printed as its own page ahead of the spreads. */
export const albumCoverSchema = z.object({
  /** "photo": one photo fills the cover under the title. "text": the title alone on the album colour. */
  layout: z.enum(["photo", "text"]),
  photoId: z.string().uuid().nullable(),
  crop: cropSchema,
  title: z.string().max(120),
  subtitle: z.string().max(200),
});
export type AlbumCoverDTO = z.infer<typeof albumCoverSchema>;

export const albumDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  status: albumStatusSchema,
  format: albumFormatSchema,
  spreads: z.array(spreadSchema),
  style: albumStyleSchema,
  cover: albumCoverSchema.nullable(),
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
  /** Build from exactly these photos (a client's picks) instead of the auto-selected best. */
  photoIds: z.array(z.string().uuid()).min(1).max(2000).optional(),
});
export type GenerateAlbumInput = z.infer<typeof generateAlbumSchema>;

/** Declared ahead of the edit schema, which needs it; MAX_PHOTOS_PER_SPREAD below is the same number. */
const MAX_PHOTOS_PER_SPREAD_LIMIT = 9;

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
    type: z.literal("REORDER_PLACEMENT"),
    spreadIndex: z.number().int().min(0),
    fromSlotId: z.string(),
    toSlotId: z.string(),
  }),
  z.object({
    type: z.literal("MOVE_PLACEMENT_ACROSS_SPREADS"),
    fromSpreadIndex: z.number().int().min(0),
    fromSlotId: z.string(),
    toSpreadIndex: z.number().int().min(0),
    toSlotId: z.string(),
  }),
  z.object({
    type: z.literal("SET_FRAME"),
    spreadIndex: z.number().int().min(0),
    slotId: z.string(),
    frame: slotFrameSchema,
  }),
  z.object({ type: z.literal("RESET_FRAMES"), spreadIndex: z.number().int().min(0) }),
  z.object({
    type: z.literal("SET_FRAMES"),
    spreadIndex: z.number().int().min(0),
    /** Several photos resized in one gesture — dragging the line between them. */
    frames: z.array(z.object({ slotId: z.string(), frame: slotFrameSchema })).min(1).max(MAX_PHOTOS_PER_SPREAD_LIMIT),
  }),
  /** Flips the layout left-to-right; the photos themselves are never flipped. */
  z.object({ type: z.literal("MIRROR_SPREAD"), spreadIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("SET_SPREAD_LOCK"), spreadIndex: z.number().int().min(0), locked: z.boolean() }),
  z.object({ type: z.literal("REMOVE_SPREAD"), index: z.number().int().min(0) }),
  z.object({
    type: z.literal("RESTORE_SPREADS"),
    /** A full spreads array from an earlier successful edit — how undo/redo work. */
    spreads: z.array(spreadSchema).min(1),
  }),
  z.object({
    type: z.literal("SET_TEXT_BLOCK"),
    spreadIndex: z.number().int().min(0),
    /** Adds the block, or replaces the one with the same id. */
    block: textBlockSchema,
  }),
  z.object({ type: z.literal("REMOVE_TEXT_BLOCK"), spreadIndex: z.number().int().min(0), blockId: z.string() }),
  z.object({ type: z.literal("SET_STYLE"), style: albumStyleSchema }),
  /** `null` removes the cover. */
  z.object({ type: z.literal("SET_COVER"), cover: albumCoverSchema.nullable() }),
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

/** Where a photo's subject sits, as fractions of its width and height (top-left origin). */
export const photoFocusSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export type PhotoFocus = z.infer<typeof photoFocusSchema>;

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
  /** 1-based group of photos shot in the same setting — see photo-similarity.ts. */
  similarityGroup: z.number().int(),
  /** Pixel size of the original, for print-resolution checks. */
  width: z.number().int(),
  height: z.number().int(),
  /** When the photo was taken (EXIF), if the camera recorded it. */
  capturedAt: z.string().datetime().nullable(),
  /** The subject's position; `null` for photos analysed before it was measured. */
  focus: photoFocusSchema.nullable(),
});
export type PhotoAnalysisDTO = z.infer<typeof photoAnalysisDtoSchema>;

/** A spread holds up to a nine-photo contact sheet. */
export const MAX_PHOTOS_PER_SPREAD = MAX_PHOTOS_PER_SPREAD_LIMIT;

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

// --- Geometry shared by the editor, the client proof and the PDF renderer -----------
// Kept here, in one pure module both sides import, so the screen and the printed file
// can never disagree about where something sits.

/** How much of the spread the photos keep with "airy" spacing: the rest becomes margin. */
export const AIRY_SCALE = 0.88;

export interface NormalisedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a template slot sits once the album style's spacing is applied. "airy" draws the
 * whole layout in towards the centre of the spread, adding margin and widening the gaps
 * in proportion. Full-bleed layouts are about running off the edge, so they never move.
 * A photographer's hand-set frame is an explicit position and is used as-is instead.
 */
export function spacedSlotRect(slot: NormalisedRect, fullBleed: boolean, spacing: AlbumStyleDTO["spacing"]): NormalisedRect {
  if (fullBleed || spacing === "classic") return { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
  return {
    x: 0.5 + (slot.x - 0.5) * AIRY_SCALE,
    y: 0.5 + (slot.y - 0.5) * AIRY_SCALE,
    width: slot.width * AIRY_SCALE,
    height: slot.height * AIRY_SCALE,
  };
}

export const FULL_CROP_RECT: NormalisedRect = { x: 0, y: 0, width: 1, height: 1 };

/** A placement nobody has framed by hand still carries the full-photo default. */
export function isUntouchedCrop(crop: NormalisedRect): boolean {
  return crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
}

/**
 * The zoom-1 crop: the largest slot-shaped rect that fits inside the photo, centred on
 * the photo's subject when one was found (and on the middle otherwise), without ever
 * running past the photo's edges. Every renderer uses this one function for a photo the
 * photographer has not framed by hand, so the editor, the client proof and the PDF show
 * the same picture. `imageAspect` and `slotAspect` are width ÷ height.
 */
export function focusedBaseCrop(imageAspect: number, slotAspect: number, focus?: PhotoFocus | null): NormalisedRect {
  const centre = focus ?? { x: 0.5, y: 0.5 };
  if (imageAspect >= slotAspect) {
    const width = slotAspect / imageAspect;
    const x = Math.min(1 - width, Math.max(0, centre.x - width / 2));
    return { x, y: 0, width, height: 1 };
  }
  const height = imageAspect / slotAspect;
  const y = Math.min(1 - height, Math.max(0, centre.y - height / 2));
  return { x: 0, y, width: 1, height };
}

/** Type size as a fraction of the page height — so a 20 cm and a 30 cm album look alike. */
export const TEXT_SIZE_RATIO: Record<TextSize, number> = {
  caption: 0.018,
  body: 0.024,
  heading: 0.042,
  title: 0.07,
};

export const TEXT_LINE_HEIGHT = 1.25;

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Near-black words on light paper, near-white on dark — always readable, never chosen by hand. */
export function textColorOn(background: string): string {
  return luminance(background) > 0.4 ? "#1d1f22" : "#f3f1ec";
}
