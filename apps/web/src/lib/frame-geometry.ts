import type { SlotFrame } from "@albumflow/contracts";

/**
 * Slot rectangles live in spread coordinates (0-1 across the whole spread), the same
 * space the templates and the PDF exporter use — so a frame dragged here prints in
 * exactly the place it appeared on screen.
 */

export const MIN_FRAME_SIZE = 0.05;

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export const RESIZE_CORNERS: ResizeCorner[] = ["nw", "ne", "sw", "se"];

/**
 * Drags the named corner by (dx, dy), expressed as a fraction of the spread. The
 * opposite corner is the anchor, which is what makes the gesture feel like grabbing
 * the paper rather than nudging a value.
 */
export function resizeFrame(
  frame: SlotFrame,
  corner: ResizeCorner,
  dx: number,
  dy: number,
): SlotFrame {
  const left = frame.x;
  const top = frame.y;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;

  const movesLeft = corner === "nw" || corner === "sw";
  const movesTop = corner === "nw" || corner === "ne";

  // Clamp each dragged edge before it can cross or crowd its anchor.
  const nextLeft = movesLeft ? clamp(left + dx, 0, right - MIN_FRAME_SIZE) : left;
  const nextRight = movesLeft ? right : clamp(right + dx, left + MIN_FRAME_SIZE, 1);
  const nextTop = movesTop ? clamp(top + dy, 0, bottom - MIN_FRAME_SIZE) : top;
  const nextBottom = movesTop ? bottom : clamp(bottom + dy, top + MIN_FRAME_SIZE, 1);

  return {
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
  };
}

/**
 * Alignment lines a dragged edge can snap to: the page's own edges and centre,
 * plus every other slot's own edges on the same spread — the exact comparisons
 * a photographer's eye makes when judging whether a layout looks aligned.
 */
export interface SnapTargets {
  x: number[];
  y: number[];
}

/** Fraction of the spread's width/height within which an edge snaps. */
export const SNAP_THRESHOLD = 0.012;

export function collectSnapTargets(rects: readonly SlotFrame[]): SnapTargets {
  const x = new Set<number>([0, 0.5, 1]);
  const y = new Set<number>([0, 0.5, 1]);
  for (const rect of rects) {
    x.add(rect.x);
    x.add(rect.x + rect.width);
    y.add(rect.y);
    y.add(rect.y + rect.height);
  }
  return { x: [...x], y: [...y] };
}

function nearestTarget(value: number, targets: readonly number[], threshold: number): number {
  let best = value;
  let bestDistance = threshold;
  for (const target of targets) {
    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * `resizeFrame`, then snaps only the edge(s) the drag actually moved — never
 * the anchor corner, which must stay exactly where the user is pinching it, or
 * the "grab the paper" feel the plain resize is built on breaks. A snap that
 * would collapse the frame below the minimum size is discarded rather than
 * applied, exactly like `resizeFrame`'s own clamp.
 */
export function resizeFrameSnapped(
  frame: SlotFrame,
  corner: ResizeCorner,
  dx: number,
  dy: number,
  targets: SnapTargets,
): SlotFrame {
  const resized = resizeFrame(frame, corner, dx, dy);
  const movesLeft = corner === "nw" || corner === "sw";
  const movesTop = corner === "nw" || corner === "ne";

  let { x, y, width, height } = resized;
  const right = x + width;
  const bottom = y + height;

  if (movesLeft) {
    const snapped = nearestTarget(x, targets.x, SNAP_THRESHOLD);
    if (snapped !== x && right - snapped >= MIN_FRAME_SIZE) {
      width = right - snapped;
      x = snapped;
    }
  } else {
    const snapped = nearestTarget(right, targets.x, SNAP_THRESHOLD);
    if (snapped !== right && snapped - x >= MIN_FRAME_SIZE) {
      width = snapped - x;
    }
  }

  if (movesTop) {
    const snapped = nearestTarget(y, targets.y, SNAP_THRESHOLD);
    if (snapped !== y && bottom - snapped >= MIN_FRAME_SIZE) {
      height = bottom - snapped;
      y = snapped;
    }
  } else {
    const snapped = nearestTarget(bottom, targets.y, SNAP_THRESHOLD);
    if (snapped !== bottom && snapped - y >= MIN_FRAME_SIZE) {
      height = snapped - y;
    }
  }

  return { x, y, width, height };
}

/** Moves the whole rectangle, keeping it on the page and its size intact. */
export function moveFrame(frame: SlotFrame, dx: number, dy: number): SlotFrame {
  return {
    ...frame,
    x: clamp(frame.x + dx, 0, 1 - frame.width),
    y: clamp(frame.y + dy, 0, 1 - frame.height),
  };
}

export function framesEqual(a: SlotFrame, b: SlotFrame): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  return close(a.x, b.x) && close(a.y, b.y) && close(a.width, b.width) && close(a.height, b.height);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type MoveDirection = "left" | "right" | "up" | "down";

/**
 * Classifies a drop point (as a 0-1 fraction of the spread's own width/height)
 * by whichever of the four page edges it's closest to — dragging a photo
 * toward the left/right/top/bottom edge of the spread is how a directional
 * move is signalled, rather than dropping it exactly on another slot.
 */
export function edgeDirectionFromPoint(nx: number, ny: number): MoveDirection {
  const distances: Record<MoveDirection, number> = { left: nx, right: 1 - nx, up: ny, down: 1 - ny };
  let best: MoveDirection = "left";
  for (const direction of ["right", "up", "down"] as const) {
    if (distances[direction] < distances[best]) best = direction;
  }
  return best;
}

/**
 * The nearest other slot whose centre lies in the given direction from
 * `fromSlotId`'s own centre — used to swap a photo with whichever neighbour
 * sits immediately to its left/right/above/below. Distance along the
 * direction of travel is what ranks candidates, but a large sideways offset
 * is penalised heavily so a directly-aligned neighbour always wins over a
 * diagonal one, even one that happens to sit slightly closer overall — this
 * is what keeps "move up" in a 2-row grid from ever picking the wrong column.
 */
export function nearestNeighborInDirection(
  rects: readonly { slotId: string; rect: SlotFrame }[],
  fromSlotId: string,
  direction: MoveDirection,
): string | undefined {
  const from = rects.find((entry) => entry.slotId === fromSlotId)?.rect;
  if (!from) return undefined;
  const fromCx = from.x + from.width / 2;
  const fromCy = from.y + from.height / 2;
  const EPS = 1e-6;

  let best: { slotId: string; score: number } | undefined;
  for (const { slotId, rect } of rects) {
    if (slotId === fromSlotId) continue;
    const dx = rect.x + rect.width / 2 - fromCx;
    const dy = rect.y + rect.height / 2 - fromCy;

    let primary: number;
    let perpendicular: number;
    if (direction === "left") {
      if (dx >= -EPS) continue;
      primary = -dx;
      perpendicular = Math.abs(dy);
    } else if (direction === "right") {
      if (dx <= EPS) continue;
      primary = dx;
      perpendicular = Math.abs(dy);
    } else if (direction === "up") {
      if (dy >= -EPS) continue;
      primary = -dy;
      perpendicular = Math.abs(dx);
    } else {
      if (dy <= EPS) continue;
      primary = dy;
      perpendicular = Math.abs(dx);
    }

    const score = primary + perpendicular * 3;
    if (!best || score < best.score) best = { slotId, score };
  }
  return best?.slotId;
}
