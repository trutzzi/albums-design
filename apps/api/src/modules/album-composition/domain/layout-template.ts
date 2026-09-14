export type SlotOrientation = "LANDSCAPE" | "PORTRAIT" | "SQUARE" | "ANY";

export interface TemplateSlot {
  id: string;
  /** Normalised to the full spread: x/y/width/height in 0-1, origin top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  prefers: SlotOrientation;
}

export interface LayoutTemplate {
  id: string;
  name: string;
  slots: TemplateSlot[];
  /** Full-bleed spreads carry a single hero image across the gutter. */
  fullBleed: boolean;
}

/**
 * House rules, taken from how album designers actually work:
 *
 *  - At least a fifth of every spread stays empty. Negative space is what makes a
 *    photograph read as a print rather than as content.
 *  - Gutters between photos are uniform, so the eye never reads an accidental
 *    emphasis into an uneven gap.
 *  - Where a spread has a lead image it is decisively larger than its neighbours,
 *    not fractionally — a near-tie reads as indecision.
 *  - The fold is a real seam. `LEFT_PAGE` / `RIGHT_PAGE` lay a photo wholly on one
 *    leaf; only deliberately wide bands are allowed to cross the centre.
 */
const GUTTER = 0.02;
const MARGIN = 0.06;

/** Content boxes that keep a photo clear of the centre fold. */
const LEFT_PAGE = { x: MARGIN, width: 0.41 };
const RIGHT_PAGE = { x: 0.53, width: 0.41 };
const BAND_TOP = 0.08;
const BAND_HEIGHT = 0.84;

/** `count` equal cells spanning [x, x + width], separated by the standard gutter. */
function row(
  prefix: string,
  count: number,
  x: number,
  y: number,
  width: number,
  height: number,
  prefers: SlotOrientation,
): TemplateSlot[] {
  const cell = (width - GUTTER * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    x: x + index * (cell + GUTTER),
    y,
    width: cell,
    height,
    prefers,
  }));
}

/** `count` equal cells stacked down [y, y + height]. */
function column(
  prefix: string,
  count: number,
  x: number,
  y: number,
  width: number,
  height: number,
  prefers: SlotOrientation,
): TemplateSlot[] {
  const cell = (height - GUTTER * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    x,
    y: y + index * (cell + GUTTER),
    width,
    height: cell,
    prefers,
  }));
}

function grid(
  id: string,
  name: string,
  columns: number,
  rows: number,
  prefers: SlotOrientation,
): LayoutTemplate {
  const usableWidth = 1 - MARGIN * 2 - GUTTER * (columns - 1);
  const usableHeight = 1 - MARGIN * 2 - GUTTER * (rows - 1);
  const cellWidth = usableWidth / columns;
  const cellHeight = usableHeight / rows;
  const slots: TemplateSlot[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      slots.push({
        id: `s${row}-${column}`,
        x: MARGIN + column * (cellWidth + GUTTER),
        y: MARGIN + row * (cellHeight + GUTTER),
        width: cellWidth,
        height: cellHeight,
        prefers,
      });
    }
  }
  return { id, name, slots, fullBleed: false };
}

export const LAYOUT_TEMPLATES: readonly LayoutTemplate[] = [
  // --- one photo ---------------------------------------------------------
  {
    id: "hero-full-bleed",
    name: "Full bleed hero",
    fullBleed: true,
    slots: [{ id: "hero", x: 0, y: 0, width: 1, height: 1, prefers: "LANDSCAPE" }],
  },
  {
    id: "single-centred",
    name: "Single centred",
    fullBleed: false,
    slots: [{ id: "centre", x: 0.18, y: 0.12, width: 0.64, height: 0.76, prefers: "ANY" }],
  },
  {
    id: "panorama-band",
    name: "Panoramic band",
    fullBleed: false,
    slots: [{ id: "band", x: MARGIN, y: 0.3, width: 0.88, height: 0.4, prefers: "LANDSCAPE" }],
  },
  {
    id: "single-right-page",
    name: "Right page only",
    fullBleed: false,
    slots: [{ id: "plate", x: 0.54, y: 0.14, width: 0.4, height: 0.72, prefers: "PORTRAIT" }],
  },
  {
    id: "single-left-page",
    name: "Left page only",
    fullBleed: false,
    slots: [{ id: "plate", x: MARGIN, y: 0.14, width: 0.4, height: 0.72, prefers: "PORTRAIT" }],
  },
  {
    // Deliberately off-centre: the empty lower right is the point, not a leftover.
    id: "editorial-plate",
    name: "Editorial plate",
    fullBleed: false,
    slots: [{ id: "plate", x: MARGIN, y: 0.08, width: 0.52, height: 0.6, prefers: "ANY" }],
  },
  {
    id: "gallery-square",
    name: "Gallery square",
    fullBleed: false,
    slots: [{ id: "plate", x: 0.325, y: 0.15, width: 0.35, height: 0.7, prefers: "SQUARE" }],
  },
  {
    id: "standing-portrait",
    name: "Standing portrait",
    fullBleed: false,
    slots: [{ id: "plate", x: 0.38, y: 0.06, width: 0.24, height: 0.88, prefers: "PORTRAIT" }],
  },

  // --- two photos --------------------------------------------------------
  {
    id: "portrait-pair",
    name: "Portrait pair",
    fullBleed: false,
    slots: [
      { id: "left", x: MARGIN, y: 0.1, width: 0.4, height: 0.8, prefers: "PORTRAIT" },
      { id: "right", x: 0.54, y: 0.1, width: 0.4, height: 0.8, prefers: "PORTRAIT" },
    ],
  },
  {
    id: "landscape-stack",
    name: "Landscape stack",
    fullBleed: false,
    slots: [
      { id: "top", x: MARGIN, y: 0.08, width: 0.88, height: 0.4, prefers: "LANDSCAPE" },
      { id: "bottom", x: MARGIN, y: 0.52, width: 0.88, height: 0.4, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "duo-offset",
    name: "Offset pair",
    fullBleed: false,
    slots: [
      { id: "lead", x: MARGIN, y: 0.12, width: 0.52, height: 0.6, prefers: "ANY" },
      { id: "echo", x: 0.62, y: 0.34, width: 0.32, height: 0.46, prefers: "ANY" },
    ],
  },
  {
    id: "panorama-stack",
    name: "Banner over wide",
    fullBleed: false,
    slots: [
      { id: "banner", x: MARGIN, y: 0.08, width: 0.88, height: 0.3, prefers: "LANDSCAPE" },
      { id: "below", x: MARGIN, y: 0.42, width: 0.88, height: 0.5, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "page-and-inset",
    name: "Full page with inset",
    fullBleed: false,
    slots: [
      { id: "page", x: 0.04, y: 0.06, width: 0.5, height: 0.88, prefers: "PORTRAIT" },
      { id: "inset", x: 0.62, y: 0.38, width: 0.3, height: 0.24, prefers: "LANDSCAPE" },
    ],
  },
  {
    // The lead is roughly five times the area of its companion — the hierarchy is
    // unmistakable, which is what makes an asymmetric spread work.
    id: "dominant-left",
    name: "Dominant left",
    fullBleed: false,
    slots: [
      { id: "lead", x: MARGIN, y: 0.08, width: 0.54, height: 0.84, prefers: "ANY" },
      { id: "note", x: 0.64, y: 0.34, width: 0.3, height: 0.32, prefers: "ANY" },
    ],
  },
  {
    id: "dominant-right",
    name: "Dominant right",
    fullBleed: false,
    slots: [
      { id: "note", x: MARGIN, y: 0.34, width: 0.3, height: 0.32, prefers: "ANY" },
      { id: "lead", x: 0.4, y: 0.08, width: 0.54, height: 0.84, prefers: "ANY" },
    ],
  },
  {
    id: "pair-diagonal",
    name: "Diagonal pair",
    fullBleed: false,
    slots: [
      { id: "first", x: MARGIN, y: 0.08, width: 0.42, height: 0.46, prefers: "ANY" },
      { id: "second", x: 0.52, y: 0.46, width: 0.42, height: 0.46, prefers: "ANY" },
    ],
  },
  {
    id: "square-duo",
    name: "Two squares",
    fullBleed: false,
    slots: [
      { id: "left", x: 0.14, y: 0.25, width: 0.25, height: 0.5, prefers: "SQUARE" },
      { id: "right", x: 0.61, y: 0.25, width: 0.25, height: 0.5, prefers: "SQUARE" },
    ],
  },
  {
    id: "tall-and-wide",
    name: "Tall and wide",
    fullBleed: false,
    slots: [
      { id: "tall", x: 0.08, y: 0.06, width: 0.34, height: 0.88, prefers: "PORTRAIT" },
      { id: "wide", x: 0.5, y: 0.3, width: 0.44, height: 0.4, prefers: "LANDSCAPE" },
    ],
  },

  // --- three photos ------------------------------------------------------
  {
    id: "feature-left",
    name: "Feature left with pair",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.1, width: 0.5, height: 0.8, prefers: "PORTRAIT" },
      { id: "top", x: 0.62, y: 0.1, width: 0.32, height: 0.385, prefers: "LANDSCAPE" },
      { id: "bottom", x: 0.62, y: 0.515, width: 0.32, height: 0.385, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "feature-right",
    name: "Feature right with pair",
    fullBleed: false,
    slots: [
      { id: "top", x: MARGIN, y: 0.1, width: 0.32, height: 0.385, prefers: "LANDSCAPE" },
      { id: "bottom", x: MARGIN, y: 0.515, width: 0.32, height: 0.385, prefers: "LANDSCAPE" },
      { id: "feature", x: 0.44, y: 0.1, width: 0.5, height: 0.8, prefers: "PORTRAIT" },
    ],
  },
  {
    id: "triptych",
    name: "Triptych",
    fullBleed: false,
    ...gridSlots(3, 1, "PORTRAIT"),
  },
  {
    id: "banner-over-two",
    name: "Banner over pair",
    fullBleed: false,
    slots: [
      { id: "banner", x: MARGIN, y: 0.08, width: 0.88, height: 0.42, prefers: "LANDSCAPE" },
      { id: "left", x: MARGIN, y: 0.56, width: 0.42, height: 0.36, prefers: "LANDSCAPE" },
      { id: "right", x: 0.52, y: 0.56, width: 0.42, height: 0.36, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "two-over-banner",
    name: "Pair over banner",
    fullBleed: false,
    slots: [
      { id: "left", x: MARGIN, y: 0.08, width: 0.42, height: 0.36, prefers: "LANDSCAPE" },
      { id: "right", x: 0.52, y: 0.08, width: 0.42, height: 0.36, prefers: "LANDSCAPE" },
      { id: "banner", x: MARGIN, y: 0.5, width: 0.88, height: 0.42, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "stack-three",
    name: "Three bands",
    fullBleed: false,
    slots: [
      { id: "b1", x: 0.1, y: 0.08, width: 0.8, height: 0.26, prefers: "LANDSCAPE" },
      { id: "b2", x: 0.1, y: 0.37, width: 0.8, height: 0.26, prefers: "LANDSCAPE" },
      { id: "b3", x: 0.1, y: 0.66, width: 0.8, height: 0.26, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "trio-flanked",
    name: "Centre stage",
    fullBleed: false,
    slots: [
      { id: "left", x: MARGIN, y: 0.3, width: 0.24, height: 0.4, prefers: "ANY" },
      { id: "centre", x: 0.33, y: 0.12, width: 0.34, height: 0.76, prefers: "PORTRAIT" },
      { id: "right", x: 0.7, y: 0.3, width: 0.24, height: 0.4, prefers: "ANY" },
    ],
  },
  {
    id: "three-diagonal",
    name: "Descending three",
    fullBleed: false,
    slots: [
      { id: "d1", x: MARGIN, y: 0.08, width: 0.28, height: 0.34, prefers: "ANY" },
      { id: "d2", x: 0.36, y: 0.33, width: 0.28, height: 0.34, prefers: "ANY" },
      { id: "d3", x: 0.66, y: 0.58, width: 0.28, height: 0.34, prefers: "ANY" },
    ],
  },
  {
    id: "page-pair-plate",
    name: "Pair left, plate right",
    fullBleed: false,
    slots: [
      ...column("l", 2, LEFT_PAGE.x, BAND_TOP, LEFT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
      {
        id: "plate",
        x: RIGHT_PAGE.x,
        y: BAND_TOP,
        width: RIGHT_PAGE.width,
        height: BAND_HEIGHT,
        prefers: "PORTRAIT",
      },
    ],
  },
  {
    id: "plate-page-pair",
    name: "Plate left, pair right",
    fullBleed: false,
    slots: [
      {
        id: "plate",
        x: LEFT_PAGE.x,
        y: BAND_TOP,
        width: LEFT_PAGE.width,
        height: BAND_HEIGHT,
        prefers: "PORTRAIT",
      },
      ...column("r", 2, RIGHT_PAGE.x, BAND_TOP, RIGHT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
    ],
  },

  // --- four photos -------------------------------------------------------
  {
    id: "mosaic-left",
    name: "Mosaic, feature left",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.1, width: 0.5, height: 0.8, prefers: "PORTRAIT" },
      { id: "m1", x: 0.6, y: 0.1, width: 0.34, height: 0.25, prefers: "LANDSCAPE" },
      { id: "m2", x: 0.6, y: 0.375, width: 0.34, height: 0.25, prefers: "LANDSCAPE" },
      { id: "m3", x: 0.6, y: 0.65, width: 0.34, height: 0.25, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "mosaic-right",
    name: "Mosaic, feature right",
    fullBleed: false,
    slots: [
      { id: "m1", x: MARGIN, y: 0.1, width: 0.34, height: 0.25, prefers: "LANDSCAPE" },
      { id: "m2", x: MARGIN, y: 0.375, width: 0.34, height: 0.25, prefers: "LANDSCAPE" },
      { id: "m3", x: MARGIN, y: 0.65, width: 0.34, height: 0.25, prefers: "LANDSCAPE" },
      { id: "feature", x: 0.44, y: 0.1, width: 0.5, height: 0.8, prefers: "PORTRAIT" },
    ],
  },
  {
    id: "feature-over-three",
    name: "Feature over three",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.08, width: 0.88, height: 0.5, prefers: "LANDSCAPE" },
      { id: "t1", x: MARGIN, y: 0.62, width: 0.28, height: 0.3, prefers: "SQUARE" },
      { id: "t2", x: 0.36, y: 0.62, width: 0.28, height: 0.3, prefers: "SQUARE" },
      { id: "t3", x: 0.66, y: 0.62, width: 0.28, height: 0.3, prefers: "SQUARE" },
    ],
  },
  {
    id: "two-per-page",
    name: "Two per page",
    fullBleed: false,
    slots: [
      { id: "l1", x: MARGIN, y: 0.1, width: 0.38, height: 0.38, prefers: "LANDSCAPE" },
      { id: "l2", x: MARGIN, y: 0.52, width: 0.38, height: 0.38, prefers: "LANDSCAPE" },
      { id: "r1", x: 0.56, y: 0.1, width: 0.38, height: 0.38, prefers: "LANDSCAPE" },
      { id: "r2", x: 0.56, y: 0.52, width: 0.38, height: 0.38, prefers: "LANDSCAPE" },
    ],
  },
  grid("quad", "Quad grid", 2, 2, "ANY"),
  {
    id: "detail-strip",
    name: "Detail strip",
    fullBleed: false,
    ...gridSlots(4, 1, "SQUARE"),
  },
  {
    // Four frames rotating around the centre: no two share an edge line, which is
    // what stops a four-photo spread from reading as a contact sheet.
    id: "pinwheel-four",
    name: "Pinwheel",
    fullBleed: false,
    slots: [
      { id: "p1", x: MARGIN, y: 0.08, width: 0.5, height: 0.42, prefers: "LANDSCAPE" },
      { id: "p2", x: 0.6, y: 0.08, width: 0.34, height: 0.56, prefers: "PORTRAIT" },
      { id: "p3", x: MARGIN, y: 0.54, width: 0.34, height: 0.38, prefers: "PORTRAIT" },
      { id: "p4", x: 0.44, y: 0.68, width: 0.5, height: 0.24, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "three-over-feature",
    name: "Three over feature",
    fullBleed: false,
    slots: [
      ...row("t", 3, MARGIN, 0.08, 0.88, 0.3, "SQUARE"),
      { id: "feature", x: MARGIN, y: 0.42, width: 0.88, height: 0.5, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "plate-and-trio",
    name: "Plate left, three right",
    fullBleed: false,
    slots: [
      {
        id: "plate",
        x: LEFT_PAGE.x,
        y: BAND_TOP,
        width: LEFT_PAGE.width,
        height: BAND_HEIGHT,
        prefers: "PORTRAIT",
      },
      ...column("r", 3, RIGHT_PAGE.x, BAND_TOP, RIGHT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
    ],
  },
  {
    id: "trio-and-plate",
    name: "Three left, plate right",
    fullBleed: false,
    slots: [
      ...column("l", 3, LEFT_PAGE.x, BAND_TOP, LEFT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
      {
        id: "plate",
        x: RIGHT_PAGE.x,
        y: BAND_TOP,
        width: RIGHT_PAGE.width,
        height: BAND_HEIGHT,
        prefers: "PORTRAIT",
      },
    ],
  },
  {
    id: "quad-offset",
    name: "Offset quad",
    fullBleed: false,
    slots: [
      { id: "a", x: MARGIN, y: 0.08, width: 0.42, height: 0.4, prefers: "ANY" },
      { id: "b", x: MARGIN, y: 0.52, width: 0.42, height: 0.4, prefers: "ANY" },
      { id: "c", x: 0.52, y: 0.2, width: 0.42, height: 0.4, prefers: "ANY" },
      { id: "d", x: 0.52, y: 0.64, width: 0.42, height: 0.28, prefers: "ANY" },
    ],
  },

  // --- five photos -------------------------------------------------------
  {
    id: "gallery-five",
    name: "Feature with gallery",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.1, width: 0.54, height: 0.8, prefers: "ANY" },
      { id: "g1", x: 0.63, y: 0.1, width: 0.15, height: 0.38, prefers: "PORTRAIT" },
      { id: "g2", x: 0.79, y: 0.1, width: 0.15, height: 0.38, prefers: "PORTRAIT" },
      { id: "g3", x: 0.63, y: 0.52, width: 0.15, height: 0.38, prefers: "PORTRAIT" },
      { id: "g4", x: 0.79, y: 0.52, width: 0.15, height: 0.38, prefers: "PORTRAIT" },
    ],
  },
  {
    id: "gallery-five-left",
    name: "Gallery with feature right",
    fullBleed: false,
    slots: [
      { id: "g1", x: MARGIN, y: 0.1, width: 0.15, height: 0.38, prefers: "PORTRAIT" },
      { id: "g2", x: 0.22, y: 0.1, width: 0.15, height: 0.38, prefers: "PORTRAIT" },
      { id: "g3", x: MARGIN, y: 0.52, width: 0.15, height: 0.38, prefers: "PORTRAIT" },
      { id: "g4", x: 0.22, y: 0.52, width: 0.15, height: 0.38, prefers: "PORTRAIT" },
      { id: "feature", x: 0.4, y: 0.1, width: 0.54, height: 0.8, prefers: "ANY" },
    ],
  },
  {
    id: "banner-over-four",
    name: "Banner over four",
    fullBleed: false,
    slots: [
      { id: "banner", x: MARGIN, y: 0.08, width: 0.88, height: 0.46, prefers: "LANDSCAPE" },
      ...row("s", 4, MARGIN, 0.58, 0.88, 0.34, "SQUARE"),
    ],
  },
  {
    id: "strip-five",
    name: "Five across",
    fullBleed: false,
    ...gridSlots(5, 1, "PORTRAIT"),
  },
  {
    id: "four-over-banner",
    name: "Four over banner",
    fullBleed: false,
    slots: [
      ...row("s", 4, MARGIN, 0.08, 0.88, 0.34, "SQUARE"),
      { id: "banner", x: MARGIN, y: 0.46, width: 0.88, height: 0.46, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "feature-with-quartet",
    name: "Feature with quartet",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.08, width: 0.46, height: 0.84, prefers: "ANY" },
      ...column("a", 2, 0.56, 0.08, 0.18, 0.84, "ANY"),
      ...column("b", 2, 0.76, 0.08, 0.18, 0.84, "ANY"),
    ],
  },
  {
    id: "pair-and-trio",
    name: "Pair left, three right",
    fullBleed: false,
    slots: [
      ...column("l", 2, LEFT_PAGE.x, BAND_TOP, LEFT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
      ...column("r", 3, RIGHT_PAGE.x, BAND_TOP, RIGHT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
    ],
  },
  {
    id: "trio-and-pair",
    name: "Three left, pair right",
    fullBleed: false,
    slots: [
      ...column("l", 3, LEFT_PAGE.x, BAND_TOP, LEFT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
      ...column("r", 2, RIGHT_PAGE.x, BAND_TOP, RIGHT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
    ],
  },
  {
    id: "staircase-five",
    name: "Staircase",
    fullBleed: false,
    slots: [
      { id: "s1", x: MARGIN, y: 0.1, width: 0.16, height: 0.3, prefers: "ANY" },
      { id: "s2", x: 0.24, y: 0.22, width: 0.16, height: 0.3, prefers: "ANY" },
      { id: "s3", x: 0.42, y: 0.34, width: 0.16, height: 0.3, prefers: "ANY" },
      { id: "s4", x: 0.6, y: 0.46, width: 0.16, height: 0.3, prefers: "ANY" },
      { id: "s5", x: 0.78, y: 0.58, width: 0.16, height: 0.3, prefers: "ANY" },
    ],
  },

  // --- six photos --------------------------------------------------------
  {
    id: "three-per-page",
    name: "Three per page",
    fullBleed: false,
    slots: [
      { id: "l1", x: MARGIN, y: 0.08, width: 0.38, height: 0.26, prefers: "LANDSCAPE" },
      { id: "l2", x: MARGIN, y: 0.37, width: 0.38, height: 0.26, prefers: "LANDSCAPE" },
      { id: "l3", x: MARGIN, y: 0.66, width: 0.38, height: 0.26, prefers: "LANDSCAPE" },
      { id: "r1", x: 0.56, y: 0.08, width: 0.38, height: 0.26, prefers: "LANDSCAPE" },
      { id: "r2", x: 0.56, y: 0.37, width: 0.38, height: 0.26, prefers: "LANDSCAPE" },
      { id: "r3", x: 0.56, y: 0.66, width: 0.38, height: 0.26, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "banner-over-five",
    name: "Banner over five",
    fullBleed: false,
    slots: [
      { id: "banner", x: MARGIN, y: 0.06, width: 0.88, height: 0.42, prefers: "LANDSCAPE" },
      ...row("s", 5, MARGIN, 0.52, 0.88, 0.32, "SQUARE"),
    ],
  },
  grid("six-up", "Six up", 3, 2, "ANY"),
  grid("six-tall", "Six tall", 2, 3, "PORTRAIT"),
  {
    id: "six-across",
    name: "Six across",
    fullBleed: false,
    ...gridSlots(6, 1, "PORTRAIT"),
  },
  {
    id: "mosaic-six",
    name: "Feature with five",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.08, width: 0.5, height: 0.84, prefers: "ANY" },
      { id: "m1", x: 0.6, y: 0.08, width: 0.16, height: 0.26, prefers: "ANY" },
      { id: "m2", x: 0.78, y: 0.08, width: 0.16, height: 0.26, prefers: "ANY" },
      { id: "m3", x: 0.6, y: 0.37, width: 0.16, height: 0.26, prefers: "ANY" },
      { id: "m4", x: 0.78, y: 0.37, width: 0.16, height: 0.26, prefers: "ANY" },
      { id: "m5", x: 0.6, y: 0.66, width: 0.34, height: 0.26, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "two-over-four",
    name: "Two over four",
    fullBleed: false,
    slots: [
      ...row("t", 2, MARGIN, 0.08, 0.88, 0.42, "LANDSCAPE"),
      ...row("b", 4, MARGIN, 0.54, 0.88, 0.38, "SQUARE"),
    ],
  },
  {
    id: "four-over-two",
    name: "Four over two",
    fullBleed: false,
    slots: [
      ...row("t", 4, MARGIN, 0.08, 0.88, 0.38, "SQUARE"),
      ...row("b", 2, MARGIN, 0.5, 0.88, 0.42, "LANDSCAPE"),
    ],
  },

  // --- seven photos ------------------------------------------------------
  {
    id: "feature-with-six",
    name: "Feature with six",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.08, width: 0.46, height: 0.84, prefers: "ANY" },
      ...column("a", 3, 0.56, 0.08, 0.18, 0.84, "ANY"),
      ...column("b", 3, 0.76, 0.08, 0.18, 0.84, "ANY"),
    ],
  },
  {
    id: "banner-over-six",
    name: "Banner over six",
    fullBleed: false,
    slots: [
      { id: "banner", x: MARGIN, y: 0.06, width: 0.88, height: 0.44, prefers: "LANDSCAPE" },
      ...row("s", 6, MARGIN, 0.54, 0.88, 0.34, "PORTRAIT"),
    ],
  },
  {
    id: "seven-mosaic",
    name: "Three, banner, three",
    fullBleed: false,
    slots: [
      ...row("t", 3, MARGIN, 0.06, 0.88, 0.24, "SQUARE"),
      { id: "banner", x: MARGIN, y: 0.34, width: 0.88, height: 0.3, prefers: "LANDSCAPE" },
      ...row("b", 3, MARGIN, 0.68, 0.88, 0.24, "SQUARE"),
    ],
  },
  {
    id: "trio-and-quartet",
    name: "Three left, four right",
    fullBleed: false,
    slots: [
      ...column("l", 3, LEFT_PAGE.x, BAND_TOP, LEFT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
      ...column("r", 4, RIGHT_PAGE.x, BAND_TOP, RIGHT_PAGE.width, BAND_HEIGHT, "LANDSCAPE"),
    ],
  },

  // --- eight photos ------------------------------------------------------
  grid("eight-up", "Eight up", 4, 2, "ANY"),
  {
    id: "quad-per-page",
    name: "Four per page",
    fullBleed: false,
    slots: [
      ...row("la", 2, LEFT_PAGE.x, 0.1, LEFT_PAGE.width, 0.38, "ANY"),
      ...row("lb", 2, LEFT_PAGE.x, 0.52, LEFT_PAGE.width, 0.38, "ANY"),
      ...row("ra", 2, RIGHT_PAGE.x, 0.1, RIGHT_PAGE.width, 0.38, "ANY"),
      ...row("rb", 2, RIGHT_PAGE.x, 0.52, RIGHT_PAGE.width, 0.38, "ANY"),
    ],
  },
  {
    id: "feature-with-seven",
    name: "Feature with seven",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.08, width: 0.46, height: 0.84, prefers: "ANY" },
      ...column("a", 3, 0.56, 0.08, 0.18, 0.62, "ANY"),
      ...column("b", 3, 0.76, 0.08, 0.18, 0.62, "ANY"),
      { id: "wide", x: 0.56, y: 0.72, width: 0.38, height: 0.2, prefers: "LANDSCAPE" },
    ],
  },
  {
    id: "two-over-six",
    name: "Two over six",
    fullBleed: false,
    slots: [
      ...row("t", 2, MARGIN, 0.08, 0.88, 0.4, "LANDSCAPE"),
      ...row("b", 6, MARGIN, 0.54, 0.88, 0.34, "PORTRAIT"),
    ],
  },

  // --- nine photos -------------------------------------------------------
  grid("nine-grid", "Contact sheet", 3, 3, "SQUARE"),
  {
    id: "feature-with-eight",
    name: "Feature with eight",
    fullBleed: false,
    slots: [
      { id: "feature", x: MARGIN, y: 0.08, width: 0.46, height: 0.84, prefers: "ANY" },
      ...column("a", 4, 0.56, 0.08, 0.18, 0.84, "ANY"),
      ...column("b", 4, 0.76, 0.08, 0.18, 0.84, "ANY"),
    ],
  },
  {
    id: "banner-over-eight",
    name: "Banner over eight",
    fullBleed: false,
    slots: [
      { id: "banner", x: MARGIN, y: 0.06, width: 0.88, height: 0.42, prefers: "LANDSCAPE" },
      ...row("t", 4, MARGIN, 0.52, 0.88, 0.19, "SQUARE"),
      ...row("b", 4, MARGIN, 0.73, 0.88, 0.19, "SQUARE"),
    ],
  },
  {
    // Widest frames at the top, narrowing downward — the eye enters big and then
    // reads the detail, rather than meeting nine equal squares at once.
    id: "cascade-nine",
    name: "Two, three, four",
    fullBleed: false,
    slots: [
      ...row("a", 2, MARGIN, 0.06, 0.88, 0.3, "LANDSCAPE"),
      ...row("b", 3, MARGIN, 0.4, 0.88, 0.24, "SQUARE"),
      ...row("c", 4, MARGIN, 0.68, 0.88, 0.24, "SQUARE"),
    ],
  },
];

function gridSlots(columns: number, rows: number, prefers: SlotOrientation): { slots: TemplateSlot[] } {
  return { slots: grid("tmp", "tmp", columns, rows, prefers).slots };
}

export function findTemplate(id: string): LayoutTemplate | undefined {
  return LAYOUT_TEMPLATES.find((template) => template.id === id);
}

export function templatesWithSlotCount(count: number): LayoutTemplate[] {
  return LAYOUT_TEMPLATES.filter((template) => template.slots.length === count);
}

/** How much of the spread the photographs cover; the rest is breathing room. */
export function inkCoverage(template: LayoutTemplate): number {
  return template.slots.reduce((sum, slot) => sum + slot.width * slot.height, 0);
}
