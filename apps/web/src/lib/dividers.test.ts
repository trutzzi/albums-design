import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDividers, moveDivider, type SlotRect } from "./dividers";

const pair: SlotRect[] = [
  { slotId: "left", rect: { x: 0.06, y: 0.1, width: 0.4, height: 0.8 } },
  { slotId: "right", rect: { x: 0.54, y: 0.1, width: 0.4, height: 0.8 } },
];

// One tall photo on the left, two stacked on the right.
const lead: SlotRect[] = [
  { slotId: "lead", rect: { x: 0.05, y: 0.1, width: 0.5, height: 0.8 } },
  { slotId: "top", rect: { x: 0.58, y: 0.1, width: 0.37, height: 0.38 } },
  { slotId: "bottom", rect: { x: 0.58, y: 0.52, width: 0.37, height: 0.38 } },
];

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("findDividers", () => {
  it("finds the line between two photos side by side", () => {
    const dividers = findDividers(pair);
    assert.equal(dividers.length, 1);
    const [divider] = dividers;
    assert.equal(divider?.axis, "vertical");
    assert.deepEqual(divider?.before, ["left"]);
    assert.deepEqual(divider?.after, ["right"]);
    assert.ok(close(divider?.position ?? 0, 0.5));
  });

  it("groups every photo on each side of one line", () => {
    const dividers = findDividers(lead);
    const vertical = dividers.find((divider) => divider.axis === "vertical");
    assert.deepEqual(vertical?.before, ["lead"]);
    assert.deepEqual(vertical?.after.sort(), ["bottom", "top"]);
    const horizontal = dividers.find((divider) => divider.axis === "horizontal");
    assert.deepEqual(horizontal?.before, ["top"]);
    assert.deepEqual(horizontal?.after, ["bottom"]);
  });

  it("ignores photos far apart", () => {
    const apart: SlotRect[] = [
      { slotId: "a", rect: { x: 0.05, y: 0.1, width: 0.2, height: 0.3 } },
      { slotId: "b", rect: { x: 0.7, y: 0.1, width: 0.2, height: 0.3 } },
    ];
    assert.equal(findDividers(apart).length, 0);
  });
});

describe("moveDivider", () => {
  it("grows one side and shrinks the other, keeping the gap", () => {
    const [divider] = findDividers(pair);
    const frames = moveDivider(pair, divider!, 0.1, false);
    const left = frames.find((entry) => entry.slotId === "left")!.frame;
    const right = frames.find((entry) => entry.slotId === "right")!.frame;
    assert.ok(close(left.width, 0.5));
    assert.ok(close(right.x, 0.64));
    assert.ok(close(right.width, 0.3));
    assert.ok(close(right.x - (left.x + left.width), 0.08), "the gap is unchanged");
  });

  it("moves every photo on the far side together", () => {
    const vertical = findDividers(lead).find((divider) => divider.axis === "vertical")!;
    const frames = moveDivider(lead, vertical, -0.1, false);
    assert.ok(close(frames.find((entry) => entry.slotId === "top")!.frame.x, 0.48));
    assert.ok(close(frames.find((entry) => entry.slotId === "bottom")!.frame.x, 0.48));
  });

  it("never squeezes a photo below the minimum size", () => {
    const [divider] = findDividers(pair);
    const frames = moveDivider(pair, divider!, 0.9, false);
    assert.ok(close(frames.find((entry) => entry.slotId === "right")!.frame.width, 0.05));
  });

  it("snaps to a third of the page", () => {
    const [divider] = findDividers(pair);
    // Dragged to just short of two thirds of the right page (0.8333…).
    const frames = moveDivider(pair, divider!, 0.8333 - 0.5 - 0.005);
    const right = frames.find((entry) => entry.slotId === "right")!.frame;
    assert.ok(close(right.x - 0.04, 5 / 6), `the gap's middle is on the guide, x=${right.x}`);
  });
});

describe("divider identity", () => {
  it("keeps the same id while the line is dragged", () => {
    const [divider] = findDividers(pair);
    const moved = moveDivider(pair, divider!, 0.1, false).map((entry) => ({ slotId: entry.slotId, rect: entry.frame }));
    const [after] = findDividers(moved);
    assert.equal(after?.id, divider?.id);
    assert.ok(Math.abs((after?.position ?? 0) - 0.6) < 1e-9, "while its position follows the drag");
  });
});
