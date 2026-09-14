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
