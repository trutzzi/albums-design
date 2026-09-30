import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_STYLE, type LayoutTemplateDTO, type PhotoAnalysisDTO } from "@albumflow/contracts";
import { checkAlbum, issuesBySpread, printResolution } from "./album-check";

const FULL = { x: 0, y: 0, width: 1, height: 1 };

const templates = new Map<string, LayoutTemplateDTO>([
  [
    "pair",
    {
      id: "pair",
      name: "Pair",
      fullBleed: false,
      slots: [
        { id: "left", x: 0.06, y: 0.1, width: 0.4, height: 0.8, prefers: "PORTRAIT" },
        { id: "right", x: 0.54, y: 0.1, width: 0.4, height: 0.8, prefers: "PORTRAIT" },
      ],
    },
  ],
  [
    "panorama",
    { id: "panorama", name: "Panorama", fullBleed: true, slots: [{ id: "band", x: 0, y: 0.2, width: 1, height: 0.6, prefers: "LANDSCAPE" }] },
  ],
]);

function analysis(photoId: string, extra: Partial<PhotoAnalysisDTO> = {}): PhotoAnalysisDTO {
  return {
    photoId,
    overall: 70,
    components: { sharpness: 70, exposure: 70, composition: 70, faceQuality: 70 },
    category: "CANDID",
    categoryConfidence: 0.8,
    orientation: "PORTRAIT",
    faceCount: 0,
    albumWorthy: true,
    similarityGroup: 1,
    width: 4000,
    height: 6000,
    capturedAt: null,
    focus: null,
    ...extra,
  };
}

function run(spreads: { templateId: string; placements: { slotId: string; photoId: string }[] }[], analyses: PhotoAnalysisDTO[]) {
  return checkAlbum({
    album: {
      format: { pageWidthMm: 300, pageHeightMm: 300, bleedMm: 3 },
      style: DEFAULT_STYLE,
      cover: null,
      spreads: spreads.map((spread) => ({
        templateId: spread.templateId,
        placements: spread.placements.map((placement) => ({ ...placement, crop: FULL, treatment: "COLOR" as const })),
      })),
    },
    templates,
    analyses: new Map(analyses.map((entry) => [entry.photoId, entry])),
    existingPhotoIds: new Set(analyses.map((entry) => entry.photoId)),
  });
}

describe("checkAlbum", () => {
  it("passes a clean album", () => {
    const issues = run([{ templateId: "pair", placements: [{ slotId: "left", photoId: "a" }, { slotId: "right", photoId: "b" }] }], [analysis("a"), analysis("b")]);
    assert.deepEqual(issues, []);
  });

  it("flags a photo too small for its printed size", () => {
    const issues = run(
      [{ templateId: "pair", placements: [{ slotId: "left", photoId: "small" }, { slotId: "right", photoId: "b" }] }],
      [analysis("small", { width: 800, height: 1200 }), analysis("b")],
    );
    const low = issues.find((issue) => issue.kind === "lowResolution");
    assert.equal(low?.severity, "error");
    assert.ok(low && "dpi" in low && low.dpi < 150);
  });

  it("flags empty slots and a photo used twice", () => {
    const issues = run(
      [
        { templateId: "pair", placements: [{ slotId: "left", photoId: "a" }, { slotId: "right", photoId: "" }] },
        { templateId: "pair", placements: [{ slotId: "left", photoId: "a" }, { slotId: "right", photoId: "b" }] },
      ],
      [analysis("a"), analysis("b")],
    );
    assert.ok(issues.some((issue) => issue.kind === "emptySlot" && issue.spreadIndex === 0));
    assert.ok(issues.some((issue) => issue.kind === "usedTwice" && issue.spreadIndex === 1 && issue.otherSpreadIndex === 0));
  });

  it("flags two frames of the same moment on neighbouring spreads", () => {
    const issues = run(
      [
        { templateId: "pair", placements: [{ slotId: "left", photoId: "a" }, { slotId: "right", photoId: "b" }] },
        { templateId: "pair", placements: [{ slotId: "left", photoId: "c" }, { slotId: "right", photoId: "d" }] },
      ],
      [
        analysis("a", { capturedAt: "2026-06-20T14:00:00.000Z", similarityGroup: 3 }),
        analysis("b"),
        analysis("c", { capturedAt: "2026-06-20T14:00:02.000Z", similarityGroup: 3 }),
        analysis("d"),
      ],
    );
    const duplicate = issues.find((issue) => issue.kind === "nearDuplicate");
    assert.equal(duplicate && "photoId" in duplicate ? duplicate.photoId : undefined, "c");
  });

  it("flags a face that would land in the binding", () => {
    const issues = run(
      [{ templateId: "panorama", placements: [{ slotId: "band", photoId: "wide" }] }],
      [analysis("wide", { width: 9000, height: 3000, orientation: "LANDSCAPE", faceCount: 2, focus: { x: 0.5, y: 0.4 } })],
    );
    assert.ok(issues.some((issue) => issue.kind === "faceOnFold"));
  });

  it("lists the best photos left out", () => {
    const issues = run(
      [{ templateId: "pair", placements: [{ slotId: "left", photoId: "a" }, { slotId: "right", photoId: "b" }] }],
      [analysis("a"), analysis("b"), analysis("star", { overall: 95 })],
    );
    const unused = issues.find((issue) => issue.kind === "unusedBest");
    assert.deepEqual(unused && "photoIds" in unused ? unused.photoIds : [], ["star"]);
  });

  it("counts markers per spread", () => {
    const counts = issuesBySpread([
      { kind: "emptySlot", severity: "error", spreadIndex: 2, slotId: "x" },
      { kind: "faceOnFold", severity: "warning", spreadIndex: 2, slotId: "y", photoId: "p" },
    ]);
    assert.deepEqual(counts.get(2), { errors: 1, warnings: 1 });
  });
});

describe("printResolution", () => {
  it("is pixels per printed inch along the tighter axis", () => {
    // Half a 600 mm spread wide (≈11.8 in) from a 3000 px-wide photo ≈ 254 dpi.
    const dpi = printResolution(FULL, { width: 3000, height: 3000 }, { x: 0, y: 0, width: 0.5, height: 1 }, 600, 300);
    assert.ok(Math.abs(dpi - 3000 / (300 / 25.4)) < 0.001);
  });
});
