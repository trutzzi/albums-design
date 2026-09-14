import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAYOUT_TEMPLATES,
  inkCoverage,
  templatesWithSlotCount,
  type LayoutTemplate,
} from "../src/modules/album-composition/domain/layout-template";
import { MAX_SLOTS_PER_SPREAD } from "../src/modules/album-composition/domain/layout-planner";

const EPSILON = 1e-6;

function overlaps(a: LayoutTemplate["slots"][number], b: LayoutTemplate["slots"][number]): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    b.x < a.x + a.width - EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    b.y < a.y + a.height - EPSILON
  );
}

describe("layout template geometry", () => {
  it("keeps every slot inside the spread", () => {
    for (const template of LAYOUT_TEMPLATES) {
      for (const slot of template.slots) {
        assert.ok(slot.width > 0 && slot.height > 0, `${template.id}/${slot.id} has no area`);
        assert.ok(
          slot.x >= -EPSILON && slot.x + slot.width <= 1 + EPSILON,
          `${template.id}/${slot.id} runs off the page horizontally`,
        );
        assert.ok(
          slot.y >= -EPSILON && slot.y + slot.height <= 1 + EPSILON,
          `${template.id}/${slot.id} runs off the page vertically`,
        );
      }
    }
  });

  it("never overlaps two slots in the same template", () => {
    for (const template of LAYOUT_TEMPLATES) {
      for (let i = 0; i < template.slots.length; i += 1) {
        for (let j = i + 1; j < template.slots.length; j += 1) {
          const a = template.slots[i]!;
          const b = template.slots[j]!;
          assert.equal(
            overlaps(a, b),
            false,
            `${template.id}: ${a.id} overlaps ${b.id}`,
          );
        }
      }
    }
  });

  it("gives every template a unique id and every slot a unique id within it", () => {
    const ids = LAYOUT_TEMPLATES.map((template) => template.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate template id");

    for (const template of LAYOUT_TEMPLATES) {
      const slotIds = template.slots.map((slot) => slot.id);
      assert.equal(new Set(slotIds).size, slotIds.length, `${template.id} has duplicate slot ids`);
    }
  });

  it("offers real choice at every spread size the editor allows", () => {
    for (let count = 1; count <= MAX_SLOTS_PER_SPREAD; count += 1) {
      const options = templatesWithSlotCount(count);
      assert.ok(
        options.length >= 3,
        `only ${options.length} layout(s) hold ${count} photo(s) — the picker would look empty`,
      );
    }
  });

  it("leaves at least a fifth of every spread empty", () => {
    for (const template of LAYOUT_TEMPLATES) {
      if (template.fullBleed) continue;
      const coverage = inkCoverage(template);
      assert.ok(
        coverage <= 0.8,
        `${template.id} covers ${Math.round(coverage * 100)}% of the spread — no breathing room`,
      );
    }
  });

  it("spaces a row of equal frames evenly", () => {
    // An uneven gap reads as accidental emphasis, so gutters within a band must match.
    for (const template of LAYOUT_TEMPLATES) {
      const bands = new Map<string, LayoutTemplate["slots"]>();
      for (const slot of template.slots) {
        const key = `${slot.y.toFixed(4)}:${slot.height.toFixed(4)}`;
        bands.set(key, [...(bands.get(key) ?? []), slot]);
      }
      for (const [, band] of bands) {
        if (band.length < 3) continue;
        const ordered = [...band].sort((a, b) => a.x - b.x);
        const gaps = ordered
          .slice(1)
          .map((slot, index) => ({
            size: slot.x - (ordered[index]!.x + ordered[index]!.width),
            from: ordered[index]!.x + ordered[index]!.width,
            to: slot.x,
          }))
          // The space either side of the fold is the binding, not a gutter.
          .filter((gap) => !(gap.from < 0.5 && gap.to > 0.5))
          .map((gap) => gap.size);
        if (gaps.length < 2) continue;
        const widest = Math.max(...gaps);
        const narrowest = Math.min(...gaps);
        assert.ok(
          widest - narrowest < 0.005,
          `${template.id} has uneven gutters in one row: ${gaps.join(", ")}`,
        );
      }
    }
  });

  it("only lets the deliberate hero layout bleed off the page", () => {
    for (const template of LAYOUT_TEMPLATES) {
      if (!template.fullBleed) continue;
      assert.equal(template.slots.length, 1, `${template.id} bleeds but holds several photos`);
    }
  });
});
