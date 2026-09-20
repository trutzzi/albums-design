import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRAY_GAP, computeTrayGrid, rowRange } from "./tray-grid";

describe("tray grid", () => {
  it("fits as many columns as the width allows at the minimum tile size", () => {
    // 268px wide sidebar content, medium tiles (72px + 6px gap): 3 columns fit.
    assert.equal(computeTrayGrid(268, 100, "m").columns, 3);
    assert.equal(computeTrayGrid(268, 100, "s").columns, 4);
    assert.equal(computeTrayGrid(268, 100, "l").columns, 2);
  });

  it("stretches the tiles so the row meets the edge exactly", () => {
    for (const width of [268, 300, 428, 520]) {
      for (const density of ["s", "m", "l"] as const) {
        const { columns, tile } = computeTrayGrid(width, 50, density);
        assert.ok(Math.abs(columns * tile + (columns - 1) * TRAY_GAP - width) < 0.001, `${width}/${density}`);
      }
    }
  });

  it("makes a wider tray hold more across", () => {
    assert.ok(computeTrayGrid(428, 100, "m").columns > computeTrayGrid(268, 100, "m").columns);
  });

  it("counts rows for a big shoot", () => {
    const grid = computeTrayGrid(268, 2000, "m");
    assert.equal(grid.rowCount, Math.ceil(2000 / grid.columns));
    assert.equal(grid.rowHeight, grid.tile + TRAY_GAP);
  });

  it("never returns zero columns, even before the width is measured", () => {
    assert.equal(computeTrayGrid(0, 10, "l").columns, 1);
    assert.equal(computeTrayGrid(20, 10, "l").columns, 1);
  });

  it("covers every photo exactly once across the rows, including a short last row", () => {
    const grid = computeTrayGrid(268, 2000, "m");
    let seen = 0;
    for (let row = 0; row < grid.rowCount; row++) {
      const { start, end } = rowRange(row, grid.columns, 2000);
      assert.equal(start, seen);
      seen = end;
    }
    assert.equal(seen, 2000);
    assert.deepEqual(rowRange(0, 3, 0), { start: 0, end: 0 });
  });
});
