import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextFocusIndex } from "./roving-focus";

describe("nextFocusIndex", () => {
  it("steps with the arrows and wraps round at both ends", () => {
    assert.equal(nextFocusIndex("ArrowDown", 0, 3), 1);
    assert.equal(nextFocusIndex("ArrowDown", 2, 3), 0);
    assert.equal(nextFocusIndex("ArrowUp", 0, 3), 2);
    assert.equal(nextFocusIndex("ArrowUp", 2, 3), 1);
  });

  it("starts from the matching end when nothing in the list has focus yet", () => {
    assert.equal(nextFocusIndex("ArrowDown", -1, 3), 0);
    assert.equal(nextFocusIndex("ArrowUp", -1, 3), 2);
  });

  it("jumps to the ends with Home and End", () => {
    assert.equal(nextFocusIndex("Home", 2, 3), 0);
    assert.equal(nextFocusIndex("End", 0, 3), 2);
  });

  it("leaves other keys, and empty lists, alone", () => {
    assert.equal(nextFocusIndex("Enter", 0, 3), null);
    assert.equal(nextFocusIndex("ArrowDown", -1, 0), null);
  });
});
