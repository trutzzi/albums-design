import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseLayout } from "./layout-choice";

const option = (templateId: string, fitScore: number) => ({
  templateId,
  name: templateId,
  photoIds: ["a", "b"],
  fitScore,
});
const ranked = [option("pair", 0.9), option("pair-offset", 0.84), option("pair-stacked", 0.6)];

describe("chooseLayout: a new spread does not copy its neighbour", () => {
  it("takes the best layout when no neighbour uses it", () => {
    assert.equal(chooseLayout(ranked, ["trio"])?.templateId, "pair");
    assert.equal(chooseLayout(ranked, [])?.templateId, "pair");
  });

  it("takes the next good layout when the spread before already uses the best", () => {
    assert.equal(chooseLayout(ranked, ["pair"])?.templateId, "pair-offset");
  });

  it("looks at both neighbours", () => {
    assert.equal(
      chooseLayout(
        [...ranked, option("pair-wide", 0.88)].sort((a, b) => b.fitScore - a.fitScore),
        ["pair", "pair-wide"],
      )?.templateId,
      "pair-offset",
    );
  });

  it("keeps the best when every alternative fits much worse: variety never beats a good fit", () => {
    assert.equal(chooseLayout([option("pair", 0.9), option("pair-stacked", 0.6)], ["pair"])?.templateId, "pair");
  });

  it("has nothing to offer for an empty ranking", () => {
    assert.equal(chooseLayout([], ["pair"]), undefined);
  });
});
