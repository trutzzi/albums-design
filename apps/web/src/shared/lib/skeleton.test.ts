import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lineWidths, tileRatios } from "./skeleton";

describe("lineWidths", () => {
  it("ends a paragraph on a short line", () => {
    assert.deepEqual(lineWidths(3), ["100%", "94%", "62%"]);
  });

  it("keeps a single line full width rather than oddly short", () => {
    assert.deepEqual(lineWidths(1), ["100%"]);
  });

  it("is empty for zero or a negative count", () => {
    assert.deepEqual(lineWidths(0), []);
    assert.deepEqual(lineWidths(-2), []);
  });
});

describe("tileRatios", () => {
  it("mixes landscape and portrait tiles, the same way every time", () => {
    const ratios = tileRatios(10);
    assert.equal(ratios.length, 10);
    assert.ok(ratios.some((ratio) => ratio > 1) && ratios.some((ratio) => ratio < 1));
    assert.deepEqual(ratios, tileRatios(10));
  });

  it("is empty for zero", () => {
    assert.deepEqual(tileRatios(0), []);
  });
});
