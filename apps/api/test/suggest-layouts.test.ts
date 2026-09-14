import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SuggestLayoutsUseCase } from "../src/modules/album-composition/application/use-cases/suggest-layouts/suggest-layouts.use-case";
import type { AnalysedPhotoDirectory } from "../src/modules/album-composition/application/ports/directories";
import type { CandidatePhoto } from "../src/modules/album-composition/domain/layout-planner";
import { findTemplate } from "../src/modules/album-composition/domain/layout-template";

function directory(photos: CandidatePhoto[]): AnalysedPhotoDirectory {
  return { listForProject: async () => photos };
}

function photo(overrides: Partial<CandidatePhoto> & { photoId: string }): CandidatePhoto {
  return {
    score: 75,
    category: "PORTRAIT",
    orientation: "LANDSCAPE",
    capturedAt: 0,
    ...overrides,
  };
}

const PROJECT = "project-1";

describe("layout suggestions for a hand-picked set", () => {
  it("only offers layouts that hold exactly the chosen number of photos", async () => {
    const photos = [
      photo({ photoId: "a" }),
      photo({ photoId: "b" }),
      photo({ photoId: "c" }),
    ];
    const result = await new SuggestLayoutsUseCase(directory(photos)).execute({
      projectId: PROJECT,
      photoIds: ["a", "b", "c"],
    });

    assert.ok(result.isSuccess);
    const suggestions = result.getValue();
    assert.ok(suggestions.length >= 2, "a 3-photo spread should have alternatives to shuffle");
    for (const suggestion of suggestions) {
      assert.equal(findTemplate(suggestion.templateId)?.slots.length, 3);
      assert.equal(suggestion.photoIds.length, 3);
      assert.deepEqual([...suggestion.photoIds].sort(), ["a", "b", "c"]);
    }
  });

  it("is ordered best fit first", async () => {
    const photos = [photo({ photoId: "a" }), photo({ photoId: "b" })];
    const result = await new SuggestLayoutsUseCase(directory(photos)).execute({
      projectId: PROJECT,
      photoIds: ["a", "b"],
    });
    const scores = result.getValue().map((entry) => entry.fitScore);
    assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
  });

  it("leads with the portrait layout for two portraits", async () => {
    const photos = [
      photo({ photoId: "a", orientation: "PORTRAIT" }),
      photo({ photoId: "b", orientation: "PORTRAIT" }),
    ];
    const result = await new SuggestLayoutsUseCase(directory(photos)).execute({
      projectId: PROJECT,
      photoIds: ["a", "b"],
    });
    assert.equal(result.getValue()[0]?.templateId, "portrait-pair");
  });

  it("leads with the landscape layout for two landscapes", async () => {
    const photos = [
      photo({ photoId: "a", orientation: "LANDSCAPE" }),
      photo({ photoId: "b", orientation: "LANDSCAPE" }),
    ];
    const result = await new SuggestLayoutsUseCase(directory(photos)).execute({
      projectId: PROJECT,
      photoIds: ["a", "b"],
    });
    assert.equal(result.getValue()[0]?.templateId, "landscape-stack");
  });

  it("puts the strongest frame in the largest slot of every option", async () => {
    const photos = [
      photo({ photoId: "weak", score: 62 }),
      photo({ photoId: "star", score: 96 }),
      photo({ photoId: "middling", score: 74 }),
    ];
    const scoreOf = new Map(photos.map((p) => [p.photoId, p.score]));

    const result = await new SuggestLayoutsUseCase(directory(photos)).execute({
      projectId: PROJECT,
      photoIds: ["weak", "star", "middling"],
    });

    for (const suggestion of result.getValue()) {
      const template = findTemplate(suggestion.templateId);
      assert.ok(template);
      const areas = template.slots.map((slot) => slot.width * slot.height);
      const largest = areas.indexOf(Math.max(...areas));
      // Ties are possible in an even grid; only assert where one slot really dominates.
      if (areas.filter((area) => area === areas[largest]).length > 1) continue;
      assert.equal(
        suggestion.photoIds[largest],
        "star",
        `${suggestion.templateId} did not feature the strongest frame`,
      );
    }
  });

  it("offers full bleed as an option for a single chosen photo", async () => {
    const result = await new SuggestLayoutsUseCase(
      directory([photo({ photoId: "solo" })]),
    ).execute({ projectId: PROJECT, photoIds: ["solo"] });

    const ids = result.getValue().map((entry) => entry.templateId);
    assert.ok(ids.includes("hero-full-bleed"), `expected full bleed among ${ids}`);
    assert.ok(ids.includes("single-centred"));
  });

  it("still suggests something when analysis has not caught up yet", async () => {
    const result = await new SuggestLayoutsUseCase(directory([])).execute({
      projectId: PROJECT,
      photoIds: ["unanalysed-1", "unanalysed-2"],
    });
    assert.ok(result.isSuccess);
    assert.ok(result.getValue().length > 0);
  });

  it("refuses a selection no spread could hold", async () => {
    const result = await new SuggestLayoutsUseCase(directory([])).execute({
      projectId: PROJECT,
      photoIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    });
    assert.ok(result.isFailure);
    assert.match(result.getError().message, /between 1 and 9/);
  });
});
