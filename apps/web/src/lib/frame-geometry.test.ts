import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_FRAME_SIZE, moveFrame, resizeFrame, framesEqual } from "./frame-geometry";

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
