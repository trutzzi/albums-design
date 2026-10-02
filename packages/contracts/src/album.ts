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

export const albumStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "EXPORTED"]);
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
  spacing: z.enum(["classic", "airy", "full"]),
  keyline: z.boolean(),
  font: albumFontSchema,
});
export type AlbumStyleDTO = z.infer<typeof albumStyleSchema>;

/** Photos fill the spread in every preset except fine-art, whose wide margins are its look. */
export const STYLE_PRESETS: Record<Exclude<AlbumStyleDTO["preset"], "custom">, AlbumStyleDTO> = {
  classic: { preset: "classic", background: "#ffffff", spacing: "full", keyline: false, font: "serif" },
  modern: { preset: "modern", background: "#ffffff", spacing: "full", keyline: false, font: "sans" },
  "fine-art": { preset: "fine-art", background: "#f4f0e8", spacing: "airy", keyline: true, font: "serif" },
  midnight: { preset: "midnight", background: "#1b1c1f", spacing: "full", keyline: false, font: "sans" },
};

/**
 * Albums stored before styles existed look exactly as they always did — template
 * geometry as drawn — so this is pinned here rather than following the presets.
 */
export const DEFAULT_STYLE: AlbumStyleDTO = {
  preset: "classic",
  background: "#ffffff",
  spacing: "classic",
  keyline: false,
  font: "serif",
};

/** What a newly generated album starts with: the classic look, photos filling the spread. */
export const NEW_ALBUM_STYLE: AlbumStyleDTO = STYLE_PRESETS.classic;

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
    frames: z
      .array(z.object({ slotId: z.string(), frame: slotFrameSchema }))
      .min(1)
      .max(MAX_PHOTOS_PER_SPREAD_LIMIT),
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

/** The layout a slot belongs to — "full" spacing needs its neighbours, not just the slot. */
export interface SpacedLayout {
  fullBleed: boolean;
  slots: readonly (NormalisedRect & { id: string })[];
}

/**
 * Where a template slot sits once the album style's spacing is applied:
 *  - "classic": exactly where the template puts it.
 *  - "airy": the whole layout drawn in towards the centre, adding margin and widening the
 *    gaps in proportion.
 *  - "full": the layout opened out to thin margins and thin gutters, so the photos fill
 *    the spread (see `fillSpread`).
 * Full-bleed layouts are about running off the edge, so they never move. A photographer's
 * hand-set frame is an explicit position and is used as-is instead of this.
 */
export function spacedSlotRect(
  slot: NormalisedRect & { id: string },
  layout: SpacedLayout,
  spacing: AlbumStyleDTO["spacing"],
): NormalisedRect {
  const plain = { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
  if (layout.fullBleed || spacing === "classic") return plain;
  if (spacing === "airy") {
    return {
      x: 0.5 + (slot.x - 0.5) * AIRY_SCALE,
      y: 0.5 + (slot.y - 0.5) * AIRY_SCALE,
      width: slot.width * AIRY_SCALE,
      height: slot.height * AIRY_SCALE,
    };
  }
  return filledLayout(layout).get(slot.id) ?? plain;
}

// --- "full" spacing ------------------------------------------------------------------
// Distances are in the spread's normalised units, like the templates themselves: on a
// typical 2:1 spread one unit of x is twice as long on paper as one unit of y, so the x
// values are about half the y ones for the same printed width.

/** Paper left around the outside of the photos. */
export const FULL_MARGIN = { x: 0.018, y: 0.035 };
/** The gap between two neighbouring photos. */
export const FULL_GUTTER = { x: 0.008, y: 0.016 };
/** Kept clear across the centre fold, so no face disappears into the binding. */
export const FULL_FOLD_GAP = 0.03;
/** How far a slot's shape may stretch while it grows — past this a portrait stops reading as one. */
export const FULL_MAX_STRETCH = 1.15;
const EPSILON = 0.0005;

/** Templates never change, so each one is opened out once per page load. */
const filledLayouts = new WeakMap<object, Map<string, NormalisedRect>>();

function filledLayout(layout: SpacedLayout): Map<string, NormalisedRect> {
  const cached = filledLayouts.get(layout.slots);
  if (cached) return cached;
  const filled = fillSpread(layout.slots);
  const byId = new Map(layout.slots.map((slot, index) => [slot.id, filled[index]!]));
  filledLayouts.set(layout.slots, byId);
  return byId;
}

/**
 * Opens a layout out to fill the spread, in two moves:
 *  1. Scale it from the centre of the spread until its outermost photos reach the thin
 *     margin. The two axes may scale differently, but never by more than
 *     FULL_MAX_STRETCH apart, so every photo keeps its shape. Scaling from the centre keeps
 *     every photo on its own side of the fold.
 *  2. Close the gaps between neighbouring photos down to the thin gutter, each photo
 *     growing by half of the gap — except across the fold, which keeps FULL_FOLD_GAP.
 * If closing gaps would make any two photos touch (a rare diagonal arrangement), the
 * layout keeps the result of the first move alone.
 */
export function fillSpread(slots: readonly NormalisedRect[]): NormalisedRect[] {
  if (slots.length === 0) return [];
  const minX = Math.min(...slots.map((slot) => slot.x));
  const maxX = Math.max(...slots.map((slot) => slot.x + slot.width));
  const minY = Math.min(...slots.map((slot) => slot.y));
  const maxY = Math.max(...slots.map((slot) => slot.y + slot.height));
  const reachX = Math.max(0.5 - minX, maxX - 0.5);
  const reachY = Math.max(0.5 - minY, maxY - 0.5);
  // Never shrink: a layout already past the margin stays where it is.
  let scaleX = reachX > EPSILON ? Math.max(1, (0.5 - FULL_MARGIN.x) / reachX) : 1;
  let scaleY = reachY > EPSILON ? Math.max(1, (0.5 - FULL_MARGIN.y) / reachY) : 1;
  scaleX = Math.min(scaleX, scaleY * FULL_MAX_STRETCH);
  scaleY = Math.min(scaleY, scaleX * FULL_MAX_STRETCH);
  const scaled = slots.map((slot) => ({
    x: 0.5 + (slot.x - 0.5) * scaleX,
    y: 0.5 + (slot.y - 0.5) * scaleY,
    width: slot.width * scaleX,
    height: slot.height * scaleY,
  }));

  const closed = scaled.map((slot, index) => {
    const others = scaled.filter((_, other) => other !== index);
    const right = slot.x + slot.width;
    const bottom = slot.y + slot.height;
    const growRight = growthTowards(right, 1, others, slot, "x", (other) => other.x - right);
    const growLeft = growthTowards(slot.x, -1, others, slot, "x", (other) => slot.x - (other.x + other.width));
    const growDown = growthTowards(bottom, 1, others, slot, "y", (other) => other.y - bottom);
    const growUp = growthTowards(slot.y, -1, others, slot, "y", (other) => slot.y - (other.y + other.height));
    // Growing into a wide gap must not turn a square into a landscape: hold each photo
    // within FULL_MAX_STRETCH of the shape its template gave it.
    const shape = slots[index]!.width / slots[index]!.height;
    const sideways = keepWithin(
      slot.width,
      growLeft + growRight,
      (slot.height + growUp + growDown) * shape * FULL_MAX_STRETCH,
    );
    const upright = keepWithin(
      slot.height,
      growUp + growDown,
      ((slot.width + (growLeft + growRight) * sideways) / shape) * FULL_MAX_STRETCH,
    );
    return {
      x: slot.x - growLeft * sideways,
      y: slot.y - growUp * upright,
      width: slot.width + (growLeft + growRight) * sideways,
      height: slot.height + (growUp + growDown) * upright,
    };
  });
  return anyTooClose(closed) ? scaled : closed;
}

/**
 * How far one edge may grow: half of the gap to the nearest photo it faces (one sharing
 * some of its span on the other axis), less half the gutter. An edge facing nothing
 * already sits at the margin, or deliberately in open paper, and stays put.
 */
function growthTowards(
  edge: number,
  /** +1 when the edge grows towards larger x/y (right, down), -1 when towards smaller. */
  direction: 1 | -1,
  others: NormalisedRect[],
  slot: NormalisedRect,
  axis: "x" | "y",
  gapTo: (other: NormalisedRect) => number,
): number {
  let growth = Number.POSITIVE_INFINITY;
  for (const other of others) {
    const shared =
      axis === "x"
        ? Math.min(slot.y + slot.height, other.y + other.height) - Math.max(slot.y, other.y)
        : Math.min(slot.x + slot.width, other.x + other.width) - Math.max(slot.x, other.x);
    const gap = gapTo(other);
    if (shared <= EPSILON || gap < -EPSILON) continue;
    const far = edge + direction * gap;
    const acrossFold = axis === "x" && Math.min(edge, far) < 0.5 + EPSILON && Math.max(edge, far) > 0.5 - EPSILON;
    // Across the fold each photo stops at its own side of the clearance, wherever the gap
    // sat before — so a photo never slides over the fold into the binding.
    const limit = acrossFold
      ? direction === 1
        ? 0.5 - FULL_FOLD_GAP / 2 - edge
        : edge - (0.5 + FULL_FOLD_GAP / 2)
      : (gap - FULL_GUTTER[axis]) / 2;
    growth = Math.min(growth, Math.max(0, limit));
  }
  return Number.isFinite(growth) ? growth : 0;
}

/** The share (0–1) of a proposed growth that keeps a side no longer than `limit`. */
function keepWithin(size: number, growth: number, limit: number): number {
  if (growth <= EPSILON || size + growth <= limit) return 1;
  return Math.max(0, Math.min(1, (limit - size) / growth));
}

function anyTooClose(rects: NormalisedRect[]): boolean {
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      const first = rects[a]!;
      const second = rects[b]!;
      const apartX = Math.max(second.x - (first.x + first.width), first.x - (second.x + second.width));
      const apartY = Math.max(second.y - (first.y + first.height), first.y - (second.y + second.height));
      if (apartX < FULL_GUTTER.x - EPSILON && apartY < FULL_GUTTER.y - EPSILON) return true;
    }
  }
  return false;
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
