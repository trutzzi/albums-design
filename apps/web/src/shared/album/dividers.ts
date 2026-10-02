import type { SlotFrame } from "@albumflow/contracts";
import { MIN_FRAME_SIZE, SNAP_THRESHOLD } from "./frame-geometry";

/**
 * The line between photos that sit side by side (or one above the other): dragging it
 * grows the photos on one side and shrinks the ones on the other, keeping the gap —
 * the way a photographer changes a 50/50 split into 65/35 without touching corners.
 */
export interface Divider {
  id: string;
  /** "vertical": a line between left and right photos, dragged sideways. */
  axis: "vertical" | "horizontal";
  /** Where the middle of the gap sits along the drag axis, as a fraction of the spread. */
  position: number;
  /** The photos whose right (or bottom) edge is this line. */
  before: string[];
  /** The photos whose left (or top) edge is this line. */
  after: string[];
  /** Where the line runs along the other axis — the extent of the photos it separates. */
  start: number;
  end: number;
}

export interface SlotRect {
  slotId: string;
  rect: SlotFrame;
}

/** Wider than this, two photos are not "next to each other" but merely on the same spread. */
const MAX_GAP = 0.1;
const MIN_OVERLAP = 0.02;
const round = (value: number) => Math.round(value * 1000) / 1000;

export function findDividers(rects: readonly SlotRect[]): Divider[] {
  const groups = new Map<string, Divider>();
  const consider = (axis: Divider["axis"], a: SlotRect, b: SlotRect) => {
    const [aEnd, bStart, aFrom, aTo, bFrom, bTo] =
      axis === "vertical"
        ? [a.rect.x + a.rect.width, b.rect.x, a.rect.y, a.rect.y + a.rect.height, b.rect.y, b.rect.y + b.rect.height]
        : [a.rect.y + a.rect.height, b.rect.y, a.rect.x, a.rect.x + a.rect.width, b.rect.x, b.rect.x + b.rect.width];
    const gap = bStart - aEnd;
    if (gap < -0.001 || gap > MAX_GAP) return;
    const overlapFrom = Math.max(aFrom, bFrom);
    const overlapTo = Math.min(aTo, bTo);
    if (overlapTo - overlapFrom < MIN_OVERLAP) return;

    const key = `${axis}:${round(aEnd)}:${round(bStart)}`;
    const divider = groups.get(key) ?? {
      id: key,
      axis,
      position: (aEnd + bStart) / 2,
      before: [],
      after: [],
      start: overlapFrom,
      end: overlapTo,
    };
    if (!divider.before.includes(a.slotId)) divider.before.push(a.slotId);
    if (!divider.after.includes(b.slotId)) divider.after.push(b.slotId);
    divider.start = Math.min(divider.start, overlapFrom);
    divider.end = Math.max(divider.end, overlapTo);
    groups.set(key, divider);
  };

  for (const a of rects) {
    for (const b of rects) {
      if (a.slotId === b.slotId) continue;
      consider("vertical", a, b);
      consider("horizontal", a, b);
    }
  }
  // A slot can't sit on both sides of the same line; such a group is a coincidence of
  // unrelated edges, and dragging it would tear the layout apart.
  return [...groups.values()]
    .filter((divider) => !divider.before.some((id) => divider.after.includes(id)))
    .map((divider) => ({
      ...divider,
      // Named after the photos it separates, never its position: the position changes with
      // every step of a drag, and a changing id would make React replace the handle under
      // the pointer and drop the drag after the first move.
      id: `${divider.axis}:${[...divider.before].sort().join(",")}|${[...divider.after].sort().join(",")}`,
    }));
}

/** Page halves and thirds (each page is half the spread), plus the gutter between pages. */
function layoutGuides(axis: Divider["axis"]): number[] {
  if (axis === "horizontal") return [1 / 3, 1 / 2, 2 / 3];
  const page = [1 / 3, 1 / 2, 2 / 3];
  return [...page.map((value) => value / 2), 0.5, ...page.map((value) => 0.5 + value / 2)];
}

/**
 * The frames after dragging `divider` by `delta` (a fraction of the spread along its
 * axis). Every photo keeps at least the minimum size, and the line snaps to the page's
 * halves and thirds and to the edges of the other photos when `snap` is on.
 */
export function moveDivider(
  rects: readonly SlotRect[],
  divider: Divider,
  delta: number,
  snap = true,
): { slotId: string; frame: SlotFrame }[] {
  const byId = new Map(rects.map((entry) => [entry.slotId, entry.rect]));
  const sizeOf = (rect: SlotFrame) => (divider.axis === "vertical" ? rect.width : rect.height);
  const before = divider.before.map((id) => byId.get(id)).filter((rect): rect is SlotFrame => Boolean(rect));
  const after = divider.after.map((id) => byId.get(id)).filter((rect): rect is SlotFrame => Boolean(rect));
  if (before.length === 0 || after.length === 0) return [];

  let moved = delta;
  if (snap) {
    const involved = new Set([...divider.before, ...divider.after]);
    const edges = rects
      .filter((entry) => !involved.has(entry.slotId))
      .flatMap(({ rect }) =>
        divider.axis === "vertical" ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height],
      );
    const target = divider.position + delta;
    let best: number | undefined;
    for (const guide of [...layoutGuides(divider.axis), ...edges]) {
      if (
        Math.abs(guide - target) <= SNAP_THRESHOLD &&
        (best === undefined || Math.abs(guide - target) < Math.abs(best - target))
      ) {
        best = guide;
      }
    }
    if (best !== undefined) moved = best - divider.position;
  }

  const growRoom = Math.min(...after.map((rect) => sizeOf(rect) - MIN_FRAME_SIZE));
  const shrinkRoom = Math.min(...before.map((rect) => sizeOf(rect) - MIN_FRAME_SIZE));
  moved = Math.min(growRoom, Math.max(-shrinkRoom, moved));

  const result: { slotId: string; frame: SlotFrame }[] = [];
  for (const id of divider.before) {
    const rect = byId.get(id);
    if (!rect) continue;
    result.push({
      slotId: id,
      frame:
        divider.axis === "vertical" ? { ...rect, width: rect.width + moved } : { ...rect, height: rect.height + moved },
    });
  }
  for (const id of divider.after) {
    const rect = byId.get(id);
    if (!rect) continue;
    result.push({
      slotId: id,
      frame:
        divider.axis === "vertical"
          ? { ...rect, x: rect.x + moved, width: rect.width - moved }
          : { ...rect, y: rect.y + moved, height: rect.height - moved },
    });
  }
  return result;
}
