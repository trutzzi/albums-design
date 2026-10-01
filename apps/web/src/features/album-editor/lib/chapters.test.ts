import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chapterStarts } from "./chapters";

const analyses = new Map([
  ["p1", { category: "PREPARATION" }],
  ["p2", { category: "PREPARATION" }],
  ["d1", { category: "DETAIL" }],
  ["c1", { category: "CEREMONY" }],
  ["c2", { category: "CEREMONY" }],
  ["r1", { category: "RECEPTION" }],
]);
const spread = (...photoIds: string[]) => ({ placements: photoIds.map((photoId) => ({ photoId })) });

describe("chapterStarts", () => {
  it("marks the spread where each part of the day begins", () => {
    const starts = chapterStarts(
      [spread("p1", "p2"), spread("p2", "d1"), spread("d1"), spread("c1", "c2", "d1"), spread("c2"), spread("r1")],
      analyses,
    );
    assert.deepEqual(starts, ["preparation", undefined, undefined, "ceremony", undefined, "party"]);
  });

  it("leaves a spread of details inside the current chapter", () => {
    assert.deepEqual(chapterStarts([spread("d1"), spread("c1")], analyses), [undefined, "ceremony"]);
  });
});
