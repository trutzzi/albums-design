import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseTemplate,
  groupIntoChapters,
  planAlbum,
  selectFromChapter,
  type CandidatePhoto,
} from "../src/modules/album-composition/domain/layout-planner";
import { findTemplate } from "../src/modules/album-composition/domain/layout-template";

const BASE = new Date("2026-06-20T12:00:00Z").getTime();

function photo(overrides: Partial<CandidatePhoto> & { photoId: string }): CandidatePhoto {
  return {
    score: 70,
    category: "PORTRAIT",
    orientation: "LANDSCAPE",
    capturedAt: BASE,
    ...overrides,
  };
}

describe("chapter grouping", () => {
  it("splits on category change", () => {
    const chapters = groupIntoChapters([
      photo({ photoId: "a", category: "CEREMONY", capturedAt: BASE }),
      photo({ photoId: "b", category: "CEREMONY", capturedAt: BASE + 1000 }),
      photo({ photoId: "c", category: "RECEPTION", capturedAt: BASE + 2000 }),
      photo({ photoId: "d", category: "RECEPTION", capturedAt: BASE + 3000 }),
    ]);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0]?.category, "CEREMONY");
    assert.equal(chapters[1]?.photos.length, 2);
  });

  it("splits the same category across a long pause", () => {
    const twoHours = 2 * 60 * 60 * 1000;
    const chapters = groupIntoChapters([
      photo({ photoId: "a", category: "PORTRAIT", capturedAt: BASE }),
      photo({ photoId: "b", category: "PORTRAIT", capturedAt: BASE + 1000 }),
      photo({ photoId: "c", category: "PORTRAIT", capturedAt: BASE + twoHours }),
      photo({ photoId: "d", category: "PORTRAIT", capturedAt: BASE + twoHours + 1000 }),
    ]);
    assert.equal(chapters.length, 2);
  });
});

describe("burst guard", () => {
  it("prefers spread-out moments over the best frames of one burst", () => {
    const burst = [
      photo({ photoId: "burst-1", score: 95, capturedAt: BASE }),
      photo({ photoId: "burst-2", score: 94, capturedAt: BASE + 500 }),
      photo({ photoId: "burst-3", score: 93, capturedAt: BASE + 1000 }),
      photo({ photoId: "later", score: 80, capturedAt: BASE + 60_000 }),
    ];
    const chosen = selectFromChapter(burst, 2, 8000);
    const ids = chosen.map((candidate) => candidate.photoId);
    assert.deepEqual(ids, ["burst-1", "later"]);
  });

  it("backfills from the same burst rather than returning fewer than the quota", () => {
    const burst = [
      photo({ photoId: "a", score: 95, capturedAt: BASE }),
      photo({ photoId: "b", score: 94, capturedAt: BASE + 500 }),
    ];
    assert.equal(selectFromChapter(burst, 2, 8000).length, 2);
  });
});

describe("template fitting", () => {
  it("puts two portraits into the portrait pair layout", () => {
    const { template, take } = chooseTemplate([
      photo({ photoId: "a", orientation: "PORTRAIT" }),
      photo({ photoId: "b", orientation: "PORTRAIT" }),
    ]);
    assert.equal(take, 2);
    assert.equal(template.id, "portrait-pair");
  });

  it("puts two landscapes into the landscape stack", () => {
    const { template } = chooseTemplate([
      photo({ photoId: "a", orientation: "LANDSCAPE" }),
      photo({ photoId: "b", orientation: "LANDSCAPE" }),
    ]);
    assert.equal(template.id, "landscape-stack");
  });
});

describe("variety and rhythm", () => {
  const shoot: CandidatePhoto[] = Array.from({ length: 40 }, (_, index) =>
    photo({
      photoId: `v${index}`,
      score: 60 + ((index * 7) % 35),
      category: index < 10 ? "PREPARATION" : index < 22 ? "CEREMONY" : "RECEPTION",
      orientation: index % 3 === 0 ? "PORTRAIT" : "LANDSCAPE",
      capturedAt: BASE + index * 4 * 60_000,
    }),
  );

  it("never runs the same layout twice in a row", () => {
    const spreads = planAlbum(shoot, { targetSpreads: 20 });
    for (let i = 1; i < spreads.length; i += 1) {
      assert.notEqual(
        spreads[i]?.templateId,
        spreads[i - 1]?.templateId,
        `spread ${i} repeats ${spreads[i]?.templateId}`,
      );
    }
  });

  it("draws on a real range of layouts rather than one favourite", () => {
    const spreads = planAlbum(shoot, { targetSpreads: 20 });
    const distinct = new Set(spreads.map((spread) => spread.templateId));
    assert.ok(distinct.size >= 5, `only used ${distinct.size} layouts: ${[...distinct]}`);

    // No single template may dominate the album.
    const counts = new Map<string, number>();
    for (const spread of spreads) {
      counts.set(spread.templateId, (counts.get(spread.templateId) ?? 0) + 1);
    }
    const commonest = Math.max(...counts.values());
    assert.ok(
      commonest <= Math.ceil(spreads.length * 0.4),
      `one layout took ${commonest} of ${spreads.length} spreads`,
    );
  });

  it("lands within one spread of the requested length", () => {
    for (const target of [5, 10, 15, 20]) {
      const actual = planAlbum(shoot, { targetSpreads: target }).length;
      assert.ok(
        Math.abs(actual - target) <= 1,
        `asked for ${target} spreads, produced ${actual}`,
      );
    }
  });

  it("gives the strongest frame of a spread the largest slot", () => {
    const scoreOf = new Map(shoot.map((candidate) => [candidate.photoId, candidate.score]));
    for (const spread of planAlbum(shoot, { targetSpreads: 15 })) {
      const template = findTemplate(spread.templateId);
      if (!template || template.slots.length < 2) continue;

      const areas = template.slots.map((slot) => slot.width * slot.height);
      const largest = areas.indexOf(Math.max(...areas));
      const scores = spread.placements.map((p) => scoreOf.get(p.photoId) ?? 0);
      assert.equal(
        scores[largest],
        Math.max(...scores),
        `${spread.templateId} put a weaker frame in its biggest slot`,
      );
    }
  });
});

describe("planAlbum", () => {
  const shoot: CandidatePhoto[] = Array.from({ length: 30 }, (_, index) =>
    photo({
      photoId: `p${index}`,
      score: 60 + (index % 7) * 5,
      category: index < 10 ? "PREPARATION" : index < 20 ? "CEREMONY" : "RECEPTION",
      orientation: index % 3 === 0 ? "PORTRAIT" : "LANDSCAPE",
      capturedAt: BASE + index * 5 * 60_000,
    }),
  );

  it("opens the album on a full-bleed hero", () => {
    const spreads = planAlbum(shoot, { targetSpreads: 8 });
    assert.ok(spreads.length > 0);
    assert.equal(spreads[0]?.templateId, "hero-full-bleed");
    assert.equal(spreads[0]?.placements.length, 1);
  });

  it("fills every slot of every template it chooses", () => {
    for (const spread of planAlbum(shoot, { targetSpreads: 8 })) {
      const template = findTemplate(spread.templateId);
      assert.ok(template, `unknown template ${spread.templateId}`);
      assert.equal(spread.placements.length, template.slots.length);
      for (const placement of spread.placements) {
        assert.notEqual(placement.photoId, "", "a slot was left empty");
      }
    }
  });

  it("never places a photo that failed the quality bar", () => {
    const mixed = [
      ...shoot,
      photo({ photoId: "rejected", score: 20, capturedAt: BASE + 999 * 60_000 }),
    ];
    const placed = new Set(
      planAlbum(mixed, { targetSpreads: 8 }).flatMap((spread) =>
        spread.placements.map((placement) => placement.photoId),
      ),
    );
    assert.equal(placed.has("rejected"), false);
  });

  it("scales the spread count with the request", () => {
    const small = planAlbum(shoot, { targetSpreads: 3 });
    const large = planAlbum(shoot, { targetSpreads: 12 });
    assert.ok(large.length > small.length, `${large.length} should exceed ${small.length}`);
  });

  it("returns nothing when no photo clears the bar", () => {
    const weak = [photo({ photoId: "x", score: 10 }), photo({ photoId: "y", score: 12 })];
    assert.deepEqual(planAlbum(weak), []);
  });
});
