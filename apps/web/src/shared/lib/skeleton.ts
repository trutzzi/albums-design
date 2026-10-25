/**
 * Shapes for loading skeletons. Deterministic on purpose: a placeholder that changed
 * between renders would flicker, and the same screen should always look the same
 * while it loads.
 */

/** Widths for `lines` lines of placeholder text: full lines, then a short last one, like a real paragraph. */
export function lineWidths(lines: number): string[] {
  const full = ["100%", "94%", "97%", "90%"];
  return Array.from({ length: Math.max(0, lines) }, (_, index) =>
    index === lines - 1 && lines > 1 ? "62%" : full[index % full.length]!,
  );
}

/** Aspect ratios (width / height) for placeholder photo tiles: a mix of landscape and portrait, as a real shoot has. */
export function tileRatios(count: number): number[] {
  const pattern = [3 / 2, 2 / 3, 3 / 2, 4 / 5, 1, 3 / 2, 2 / 3, 3 / 2];
  return Array.from({ length: Math.max(0, count) }, (_, index) => pattern[index % pattern.length]!);
}
