import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cm, madeAtOtherSize, sizeLabel } from "./print-size";

describe("print sizes", () => {
  it("reads in centimetres", () => {
    assert.equal(cm(250), "25");
    assert.equal(cm(205), "20.5");
    assert.equal(sizeLabel({ pageWidthMm: 300, pageHeightMm: 210 }), "30×21");
  });

  it("flags a PDF made at a size the album no longer has, and only then", () => {
    const album = { pageWidthMm: 300, pageHeightMm: 300 };
    assert.equal(madeAtOtherSize({ pageWidthMm: 250, pageHeightMm: 250 }, album), "25×25");
    assert.equal(madeAtOtherSize({ pageWidthMm: 300, pageHeightMm: 300 }, album), null);
    assert.equal(madeAtOtherSize({ pageWidthMm: null, pageHeightMm: null }, album), null);
  });
});
