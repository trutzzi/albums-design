import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_ZOOM,
  baseCrop,
  clampCrop,
  cropToStyle,
  pannedCrop,
  withZoom,
  zoomOf,
} from "./crop-geometry";

const FULL = { x: 0, y: 0, width: 1, height: 1 };

function pct(value: string): number {
  return Number(value.replace("%", ""));
}

describe("baseCrop", () => {
  it("crops the sides of a wide photo in a square slot", () => {
    const crop = baseCrop(2, 1);
    assert.equal(crop.width, 0.5);
    assert.equal(crop.height, 1);
    assert.equal(crop.x, 0.25);
  });

  it("crops top and bottom of a tall photo in a square slot", () => {
    const crop = baseCrop(0.5, 1);
    assert.equal(crop.width, 1);
    assert.equal(crop.height, 0.5);
    assert.equal(crop.y, 0.25);
  });

  it("uses the whole frame when photo and slot already agree", () => {
    assert.deepEqual(baseCrop(1.5, 1.5), { x: 0, y: 0, width: 1, height: 1 });
  });

  it("always produces a rect whose printed aspect equals the slot", () => {
    for (const [imageAspect, slotAspect] of [
      [2, 1],
      [0.5, 1],
      [1.5, 2],
      [3, 0.75],
    ]) {
      const crop = baseCrop(imageAspect as number, slotAspect as number);
      const printed = ((crop.width as number) * (imageAspect as number)) / ((crop.height as number) / 1);
      assert.ok(
        Math.abs(printed / (imageAspect as number) - crop.width / crop.height) < 1e-9,
        "crop aspect drifted",
      );
    }
  });
});

describe("cropToStyle", () => {
  it("reproduces object-fit: cover for an untouched photo", () => {
    // A 2:1 photo in a square slot must show its middle square: 200% wide, offset -50%.
    const style = cropToStyle(FULL, 2, 1);
    assert.equal(pct(style.width), 200);
    assert.equal(pct(style.height), 100);
    assert.equal(pct(style.left), -50);
    assert.equal(pct(style.top), 0);
  });

  it("renders the base crop identically to the untouched default", () => {
    // This is why nudging a photo for the first time produces no visible jump.
    for (const [imageAspect, slotAspect] of [
      [2, 1],
      [0.5, 1],
      [1.6, 1.2],
    ]) {
      const untouched = cropToStyle(FULL, imageAspect as number, slotAspect as number);
      const base = cropToStyle(
        baseCrop(imageAspect as number, slotAspect as number),
        imageAspect as number,
        slotAspect as number,
      );
      for (const key of ["width", "height", "left", "top"] as const) {
        assert.ok(
          Math.abs(pct(untouched[key]) - pct(base[key])) < 1e-9,
          `${key} differed: ${untouched[key]} vs ${base[key]}`,
        );
      }
    }
  });

  it("magnifies as the crop tightens", () => {
    const zoomed = withZoom(baseCrop(1, 1), 2, 1, 1);
    assert.equal(pct(cropToStyle(zoomed, 1, 1).width), 200);
  });
});

describe("zoom", () => {
  it("round-trips through zoomOf", () => {
    const crop = withZoom(baseCrop(1.5, 1), 2.5, 1.5, 1);
    assert.ok(Math.abs(zoomOf(crop, 1.5, 1) - 2.5) < 1e-9);
  });

  it("keeps the subject centred while zooming", () => {
    const start = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    const zoomed = withZoom(start, 3, 1, 1);
    assert.ok(Math.abs(zoomed.x + zoomed.width / 2 - 0.4) < 1e-9);
    assert.ok(Math.abs(zoomed.y + zoomed.height / 2 - 0.4) < 1e-9);
  });

  it("refuses to zoom out past the full frame or past the ceiling", () => {
    assert.equal(zoomOf(withZoom(baseCrop(1, 1), 0.1, 1, 1), 1, 1), 1);
    assert.ok(zoomOf(withZoom(baseCrop(1, 1), 99, 1, 1), 1, 1) <= MAX_ZOOM);
  });
});

describe("pan", () => {
  it("moves the crop against the drag, so the photo follows the cursor", () => {
    const start = withZoom(baseCrop(1, 1), 2, 1, 1);
    const dragged = pannedCrop(start, 0.1, 0, 1, 1);
    assert.ok(dragged.x < start.x, "dragging right should reveal the photo's left side");
  });

  it("never lets the frame run off the edge of the photo", () => {
    const start = withZoom(baseCrop(1, 1), 2, 1, 1);
    const shoved = pannedCrop(start, 10, 10, 1, 1);
    assert.ok(shoved.x >= 0 && shoved.x + shoved.width <= 1 + 1e-9);
    assert.ok(shoved.y >= 0 && shoved.y + shoved.height <= 1 + 1e-9);
  });
});

describe("clampCrop", () => {
  it("keeps a rect inside the photo and above the minimum size", () => {
    const clamped = clampCrop({ x: 0.9, y: -0.5, width: 0.4, height: 0.01 });
    assert.ok(clamped.x + clamped.width <= 1 + 1e-9);
    assert.equal(clamped.y, 0);
    assert.ok(clamped.height >= 0.05);
  });
});
