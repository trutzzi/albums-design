import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_STYLE, type LayoutTemplateDTO, type PhotoAnalysisDTO } from "@albumflow/contracts";
import { customSize, sharpnessAt, sharpnessVerdict, sizeOptions } from "./album-size";

const panorama: LayoutTemplateDTO = {
  id: "panorama",
  name: "Panorama",
  fullBleed: true,
  slots: [{ id: "band", x: 0, y: 0.2, width: 1, height: 0.6, prefers: "LANDSCAPE" }],
};

const photo: PhotoAnalysisDTO = {
  photoId: "wide",
  overall: 70,
  components: { sharpness: 70, exposure: 70, composition: 70, faceQuality: 70 },
  category: "CANDID",
  categoryConfidence: 0.8,
  orientation: "LANDSCAPE",
  faceCount: 0,
  albumWorthy: true,
  similarityGroup: 1,
  // Enough pixels for a 25×25 spread; spread over 30×30 the same pixels print soft.
  width: 4200,
  height: 1260,
  capturedAt: null,
  focus: null,
};

describe("sizeOptions", () => {
  it("offers the other lab sizes of the same shape, smallest first", () => {
    assert.deepEqual(
      sizeOptions({ pageWidthMm: 250, pageHeightMm: 250 }).map((size) => size.pageWidthMm),
      [200, 210, 300],
    );
    assert.deepEqual(
      sizeOptions({ pageWidthMm: 300, pageHeightMm: 210 }).map((size) => [size.pageWidthMm, size.pageHeightMm]),
      [],
    );
    assert.deepEqual(
      sizeOptions({ pageWidthMm: 200, pageHeightMm: 250 }).map((size) => [size.pageWidthMm, size.pageHeightMm]),
      [],
    );
  });
});

describe("sharpnessAt", () => {
  it("shows the photos a bigger page would turn soft", () => {
    const { now, then } = sharpnessAt(
      {
        album: {
          format: { pageWidthMm: 250, pageHeightMm: 250, bleedMm: 3 },
          style: DEFAULT_STYLE,
          cover: null,
          spreads: [
            {
              templateId: "panorama",
              placements: [
                { slotId: "band", photoId: "wide", crop: { x: 0, y: 0, width: 1, height: 1 }, treatment: "COLOR" },
              ],
            },
          ],
        },
        templates: new Map([["panorama", panorama]]),
        analyses: new Map([["wide", photo]]),
        existingPhotoIds: new Set(["wide"]),
      },
      { pageWidthMm: 300, pageHeightMm: 300 },
    );
    assert.deepEqual(now, { soft: 0, pixelated: 0 });
    assert.deepEqual(then, { soft: 1, pixelated: 0 });
  });
});

describe("sharpnessVerdict", () => {
  it("names what the size changes, so the words and the colour agree", () => {
    const none = { soft: 0, pixelated: 0 };
    assert.equal(sharpnessVerdict({ now: none, then: { soft: 0, pixelated: 2 } }), "pixelated");
    assert.equal(sharpnessVerdict({ now: none, then: { soft: 3, pixelated: 0 } }), "softer");
    assert.equal(sharpnessVerdict({ now: { soft: 3, pixelated: 0 }, then: { soft: 3, pixelated: 0 } }), "alreadySoft");
    assert.equal(sharpnessVerdict({ now: none, then: none }), "sharp");
  });
});

describe("customSize", () => {
  it("makes the height follow the shape, and says when a side is out of a lab's range", () => {
    const landscape = { pageWidthMm: 300, pageHeightMm: 210 };
    assert.deepEqual(customSize("40", landscape), { pageWidthMm: 400, pageHeightMm: 280 });
    assert.equal(customSize("", landscape), "empty");
    assert.equal(customSize("4", landscape), "outOfRange");
    assert.equal(customSize("abc", landscape), "outOfRange");
    // 95 cm wide is fine; the 133 cm height it makes on a portrait book is not.
    assert.equal(customSize("95", { pageWidthMm: 210, pageHeightMm: 300 }), "outOfRange");
  });
});
