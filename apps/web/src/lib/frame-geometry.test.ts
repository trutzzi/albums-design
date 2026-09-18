import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_FRAME_SIZE,
  SNAP_THRESHOLD,
  collectPrintGuideTargets,
  collectSnapTargets,
  edgeDirectionFromPoint,
  mergeSnapTargets,
  moveFrame,
  nearestNeighborInDirection,
  resizeFrame,
  resizeFrameSnapped,
  framesEqual,
} from "./frame-geometry";

const FRAME = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

/** Edges are recomputed as differences, so exact equality is the wrong bar. */
function near(actual: number, expected: number, what: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} !== ${expected}`);
}

describe("resizeFrame", () => {
  it("anchors the opposite corner when dragging south-east", () => {
    const next = resizeFrame(FRAME, "se", 0.1, 0.05);
    near(next.x, 0.2, "se moved x");
    near(next.y, 0.2, "se moved y");
    assert.ok(Math.abs(next.width - 0.5) < 1e-9);
    assert.ok(Math.abs(next.height - 0.45) < 1e-9);
  });

  it("moves the origin when dragging north-west", () => {
    const next = resizeFrame(FRAME, "nw", 0.05, 0.05);
    assert.ok(Math.abs(next.x - 0.25) < 1e-9);
    assert.ok(Math.abs(next.y - 0.25) < 1e-9);
    // The south-east corner stayed put.
    assert.ok(Math.abs(next.x + next.width - 0.6) < 1e-9);
    assert.ok(Math.abs(next.y + next.height - 0.6) < 1e-9);
  });

  it("keeps the untouched axis exactly where it was", () => {
    const ne = resizeFrame(FRAME, "ne", 0.1, 0);
    near(ne.y, FRAME.y, "ne moved y");
    near(ne.height, FRAME.height, "ne changed height");
    near(ne.x, FRAME.x, "ne moved x");

    const sw = resizeFrame(FRAME, "sw", 0, 0.1);
    near(sw.x + sw.width, FRAME.x + FRAME.width, "sw moved the right edge");
  });

  it("never lets a dragged edge cross its anchor", () => {
    const collapsed = resizeFrame(FRAME, "se", -5, -5);
    assert.ok(collapsed.width >= MIN_FRAME_SIZE - 1e-9);
    assert.ok(collapsed.height >= MIN_FRAME_SIZE - 1e-9);
    near(collapsed.x, FRAME.x, "collapse moved x");

    const inverted = resizeFrame(FRAME, "nw", 5, 5);
    assert.ok(inverted.width >= MIN_FRAME_SIZE - 1e-9);
    assert.ok(inverted.height >= MIN_FRAME_SIZE - 1e-9);
  });

  it("never runs off the page", () => {
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      for (const [dx, dy] of [
        [9, 9],
        [-9, -9],
        [9, -9],
        [-9, 9],
      ]) {
        const next = resizeFrame(FRAME, corner, dx as number, dy as number);
        assert.ok(next.x >= -1e-9, `${corner} pushed x negative`);
        assert.ok(next.y >= -1e-9, `${corner} pushed y negative`);
        assert.ok(next.x + next.width <= 1 + 1e-9, `${corner} overflowed width`);
        assert.ok(next.y + next.height <= 1 + 1e-9, `${corner} overflowed height`);
      }
    }
  });
});

describe("moveFrame", () => {
  it("keeps the size and shifts the origin", () => {
    const next = moveFrame(FRAME, 0.1, -0.1);
    assert.ok(Math.abs(next.x - 0.3) < 1e-9);
    assert.ok(Math.abs(next.y - 0.1) < 1e-9);
    near(next.width, FRAME.width, "move changed width");
    near(next.height, FRAME.height, "move changed height");
  });

  it("stops at the page edge instead of sliding off", () => {
    const shoved = moveFrame(FRAME, 5, 5);
    assert.ok(Math.abs(shoved.x + shoved.width - 1) < 1e-9);
    assert.ok(Math.abs(shoved.y + shoved.height - 1) < 1e-9);
    near(shoved.width, FRAME.width, "clamping changed width");
  });
});

describe("framesEqual", () => {
  it("ignores floating point noise", () => {
    assert.equal(framesEqual(FRAME, { ...FRAME, x: 0.2 + 1e-12 }), true);
    assert.equal(framesEqual(FRAME, { ...FRAME, x: 0.25 }), false);
  });
});

describe("collectSnapTargets", () => {
  it("always includes the page edges and centre, even with no other slots", () => {
    const targets = collectSnapTargets([]);
    assert.deepEqual([...targets.x].sort(), [0, 0.5, 1]);
    assert.deepEqual([...targets.y].sort(), [0, 0.5, 1]);
  });

  it("adds every rectangle's own edges, not just its origin", () => {
    const targets = collectSnapTargets([{ x: 0.1, y: 0.3, width: 0.2, height: 0.15 }]);
    const has = (values: number[], expected: number) =>
      values.some((v) => Math.abs(v - expected) < 1e-9);
    assert.ok(has(targets.x, 0.1), "left edge missing");
    assert.ok(has(targets.x, 0.3), "right edge (x + width) missing");
    assert.ok(has(targets.y, 0.3), "top edge missing");
    assert.ok(has(targets.y, 0.45), "bottom edge (y + height) missing");
  });
});

describe("resizeFrameSnapped", () => {
  const targets = collectSnapTargets([{ x: 0.5, y: 0.2, width: 0.3, height: 0.3 }]);

  it("snaps a dragged edge onto a nearby target within the threshold", () => {
    // FRAME's right edge is 0.6; the neighbour's left edge sits at 0.5. Dragging
    // "se" by -0.095 puts the raw right edge at 0.505 — within SNAP_THRESHOLD
    // (0.012) of 0.5 — so it should land exactly on 0.5, not at 0.505.
    const next = resizeFrameSnapped(FRAME, "se", -0.095, 0, targets);
    near(next.x + next.width, 0.5, "did not snap to the neighbour's left edge");
  });

  it("leaves the edge alone when nothing is within the threshold", () => {
    const next = resizeFrameSnapped(FRAME, "se", 0.033, 0, targets);
    const plain = resizeFrame(FRAME, "se", 0.033, 0);
    near(next.width, plain.width, "snapped when no target was nearby");
  });

  it("never moves the anchor corner, even when the anchor sits near a target", () => {
    // FRAME's own top-left (0.2, 0.2) is close to nothing in `targets`, but the
    // guarantee being tested is structural: an "se" drag must never touch x/y.
    const next = resizeFrameSnapped(FRAME, "se", 0.001, 0.001, targets);
    near(next.x, FRAME.x, "se drag moved the anchor's x");
    near(next.y, FRAME.y, "se drag moved the anchor's y");
  });

  it("never snaps to something that would collapse the frame below the minimum size", () => {
    // A target sitting almost on top of the anchor edge must be refused, the
    // same way resizeFrame's own clamp refuses to invert the rectangle.
    const tightTargets = collectSnapTargets([]);
    const next = resizeFrameSnapped(
      { x: 0.2, y: 0.2, width: 0.06, height: 0.4 },
      "se",
      -(0.06 - MIN_FRAME_SIZE) - SNAP_THRESHOLD / 2,
      0,
      tightTargets,
    );
    assert.ok(next.width >= MIN_FRAME_SIZE - 1e-9);
  });
});

describe("edgeDirectionFromPoint", () => {
  it("picks whichever edge the point is nearest to", () => {
    assert.equal(edgeDirectionFromPoint(0.02, 0.5), "left");
    assert.equal(edgeDirectionFromPoint(0.98, 0.5), "right");
    assert.equal(edgeDirectionFromPoint(0.5, 0.02), "up");
    assert.equal(edgeDirectionFromPoint(0.5, 0.98), "down");
  });
});

describe("nearestNeighborInDirection", () => {
  // A 2x2 grid: top-left/top-right on row 0, bottom-left/bottom-right on row 1.
  const grid = [
    { slotId: "tl", rect: { x: 0, y: 0, width: 0.48, height: 0.48 } },
    { slotId: "tr", rect: { x: 0.52, y: 0, width: 0.48, height: 0.48 } },
    { slotId: "bl", rect: { x: 0, y: 0.52, width: 0.48, height: 0.48 } },
    { slotId: "br", rect: { x: 0.52, y: 0.52, width: 0.48, height: 0.48 } },
  ];

  it("moves up into the same column, not a diagonal neighbour", () => {
    assert.equal(nearestNeighborInDirection(grid, "br", "up"), "tr");
    assert.equal(nearestNeighborInDirection(grid, "bl", "up"), "tl");
  });

  it("moves sideways into the same row", () => {
    assert.equal(nearestNeighborInDirection(grid, "tl", "right"), "tr");
    assert.equal(nearestNeighborInDirection(grid, "br", "left"), "bl");
  });

  it("returns undefined at the edge of the grid, with nowhere further to go", () => {
    assert.equal(nearestNeighborInDirection(grid, "tl", "up"), undefined);
    assert.equal(nearestNeighborInDirection(grid, "tl", "left"), undefined);
  });

  it("finds nothing perpendicular to a column of stacked, full-width bands", () => {
    const bands = [
      { slotId: "b1", rect: { x: 0.1, y: 0.08, width: 0.8, height: 0.26 } },
      { slotId: "b2", rect: { x: 0.1, y: 0.37, width: 0.8, height: 0.26 } },
      { slotId: "b3", rect: { x: 0.1, y: 0.66, width: 0.8, height: 0.26 } },
    ];
    assert.equal(nearestNeighborInDirection(bands, "b2", "up"), "b1");
    assert.equal(nearestNeighborInDirection(bands, "b2", "down"), "b3");
    assert.equal(nearestNeighborInDirection(bands, "b2", "left"), undefined);
    assert.equal(nearestNeighborInDirection(bands, "b2", "right"), undefined);
  });
});

describe("collectPrintGuideTargets", () => {
  it("places the safe-area lines the correct fraction in from each page's own edges", () => {
    const targets = collectPrintGuideTargets(150, 200, 5);
    near(targets.x[0]!, 5 / 300, "left page's outer safe edge");
    near(targets.x[1]!, 0.5 - 5 / 300, "left page's gutter-side safe edge");
    near(targets.x[2]!, 0.5 + 5 / 300, "right page's gutter-side safe edge");
    near(targets.x[3]!, 1 - 5 / 300, "right page's outer safe edge");
    near(targets.y[0]!, 5 / 200, "top safe edge");
    near(targets.y[1]!, 1 - 5 / 200, "bottom safe edge");
  });

  it("offers nothing to snap to when the profile has no safe margin", () => {
    const targets = collectPrintGuideTargets(150, 200, 0);
    assert.deepEqual(targets, { x: [], y: [] });
  });
});

describe("mergeSnapTargets", () => {
  it("combines every set's values with no duplicates", () => {
    const merged = mergeSnapTargets({ x: [0, 0.5, 1], y: [0, 1] }, { x: [0.5, 0.9], y: [0.2] });
    assert.deepEqual([...merged.x].sort(), [0, 0.5, 0.9, 1]);
    assert.deepEqual([...merged.y].sort(), [0, 0.2, 1]);
  });

  it("lets a resize actually snap to a merged-in guide line", () => {
    const targets = mergeSnapTargets(
      collectSnapTargets([]),
      collectPrintGuideTargets(150, 200, 5),
    );
    // Drag the frame's left edge to just short of the safe-area line at x = 5/300.
    const nudged = resizeFrameSnapped(FRAME, "nw", -0.2 + 5 / 300 + 0.002, 0, targets);
    near(nudged.x, 5 / 300, "left edge snapped to the safe-area guide");
  });
});
