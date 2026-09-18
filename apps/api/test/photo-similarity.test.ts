import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupBySimilarity,
  histogramDistance,
  type SimilarityCandidate,
} from "../src/modules/photo-intelligence/domain/photo-similarity";

const CLOSE_A = [0.5, 0.5, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 0];
const CLOSE_B = [0.45, 0.55, 0, 0, 0, 0, 0, 0, 0.45, 0.55, 0, 0, 0, 0, 0, 0, 0.45, 0.55, 0, 0, 0, 0, 0, 0];
const FAR = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0.5, 0.5];

function at(minutesFromEpoch: number): Date {
  return new Date(minutesFromEpoch * 60 * 1000);
}

describe("histogramDistance", () => {
  it("is zero for identical histograms", () => {
    assert.equal(histogramDistance(CLOSE_A, CLOSE_A), 0);
  });

  it("is large between very different histograms", () => {
    assert.ok(histogramDistance(CLOSE_A, FAR) > 1);
  });
});

describe("groupBySimilarity", () => {
  it("groups photos with close histograms shot minutes apart into the same group", () => {
    const candidates: SimilarityCandidate[] = [
      { photoId: "a", histogram: CLOSE_A, capturedAt: at(0) },
      { photoId: "b", histogram: CLOSE_B, capturedAt: at(3) },
      { photoId: "c", histogram: FAR, capturedAt: at(1) },
    ];
    const groups = groupBySimilarity(candidates);
    assert.equal(groups.get("a"), groups.get("b"));
    assert.notEqual(groups.get("a"), groups.get("c"));
  });

  it("keeps close-looking photos apart when they were shot hours apart", () => {
    const candidates: SimilarityCandidate[] = [
      { photoId: "a", histogram: CLOSE_A, capturedAt: at(0) },
      { photoId: "b", histogram: CLOSE_B, capturedAt: at(300) },
    ];
    const groups = groupBySimilarity(candidates);
    assert.notEqual(groups.get("a"), groups.get("b"));
  });

  it("falls back to histogram alone when a capture time is missing", () => {
    const candidates: SimilarityCandidate[] = [
      { photoId: "a", histogram: CLOSE_A, capturedAt: undefined },
      { photoId: "b", histogram: CLOSE_B, capturedAt: at(9999) },
    ];
    const groups = groupBySimilarity(candidates);
    assert.equal(groups.get("a"), groups.get("b"));
  });

  it("gives every photo a group, including one with no histogram at all", () => {
    const candidates: SimilarityCandidate[] = [
      { photoId: "a", histogram: CLOSE_A, capturedAt: at(0) },
      { photoId: "b", histogram: undefined, capturedAt: at(0) },
    ];
    const groups = groupBySimilarity(candidates);
    assert.equal(groups.size, 2);
    assert.notEqual(groups.get("a"), groups.get("b"));
  });

  it("orders group numbers by size, largest first", () => {
    const candidates: SimilarityCandidate[] = [
      { photoId: "solo", histogram: FAR, capturedAt: at(0) },
      { photoId: "a", histogram: CLOSE_A, capturedAt: at(0) },
      { photoId: "b", histogram: CLOSE_B, capturedAt: at(1) },
      { photoId: "c", histogram: CLOSE_A, capturedAt: at(2) },
    ];
    const groups = groupBySimilarity(candidates);
    assert.equal(groups.get("a"), 1);
    assert.equal(groups.get("b"), 1);
    assert.equal(groups.get("c"), 1);
    assert.equal(groups.get("solo"), 2);
  });
});
