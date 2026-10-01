export type TrayDensity = "s" | "m" | "l";

/** The smallest a thumbnail may be, per density; tiles then grow to fill the row exactly. */
export const TRAY_MIN_TILE: Record<TrayDensity, number> = { s: 52, m: 72, l: 104 };
export const TRAY_GAP = 6;

export interface TrayGrid {
  columns: number;
  /** Width (and height — tiles are square) of one thumbnail. */
  tile: number;
  /** Vertical distance from one row to the next. */
  rowHeight: number;
  rowCount: number;
}

/**
 * How a width divides into square tiles: as many columns as fit at the minimum
 * size, then the tiles stretch so the last column meets the edge with no ragged
 * space. Kept pure so the layout of a 2,000-photo tray can be tested without a browser.
 */
export function computeTrayGrid(width: number, photoCount: number, density: TrayDensity): TrayGrid {
  const min = TRAY_MIN_TILE[density];
  const columns = Math.max(1, Math.floor((width + TRAY_GAP) / (min + TRAY_GAP)));
  const tile = width > 0 ? (width - TRAY_GAP * (columns - 1)) / columns : min;
  return {
    columns,
    tile,
    rowHeight: tile + TRAY_GAP,
    rowCount: Math.ceil(photoCount / columns),
  };
}

/** The photo indexes shown in one row of the grid. */
export function rowRange(row: number, columns: number, photoCount: number): { start: number; end: number } {
  const start = row * columns;
  return { start, end: Math.min(start + columns, photoCount) };
}
