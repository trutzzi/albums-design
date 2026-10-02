import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import {
  AIRY_SCALE,
  DEFAULT_STYLE,
  NEW_ALBUM_STYLE,
  FULL_MARGIN,
  FULL_MAX_STRETCH,
  STYLE_PRESETS,
  albumEditSchema,
  spacedSlotRect,
  textColorOn,
  type TextBlockDTO,
} from "@albumflow/contracts";
import { LAYOUT_TEMPLATES } from "../src/modules/album-composition/domain/layout-template";
import { Album, AlbumLockedError, MAX_TEXT_BLOCKS_PER_SPREAD } from "../src/modules/album-composition/domain/album";
import { EditAlbumUseCase } from "../src/modules/album-composition/application/use-cases/edit-album/edit-album.use-case";
import { InMemoryAlbumRepository } from "./support/in-memory";

function album() {
  return Album.create({
    projectId: UniqueEntityId.create(),
    title: "Ana & Mihai",
    spreads: [
      {
        templateId: "single-centred",
        placements: [
          { slotId: "centre", photoId: "p1", crop: { x: 0, y: 0, width: 1, height: 1 }, treatment: "COLOR" },
        ],
      },
    ],
  });
}

const block = (id: string, overrides: Partial<TextBlockDTO> = {}): TextBlockDTO => ({
  id,
  text: "Ana & Mihai",
  x: 0.1,
  y: 0.1,
  width: 0.3,
  height: 0.1,
  size: "title",
  align: "center",
  ...overrides,
});

describe("text on spreads", () => {
  it("adds a block, then replaces it by id", () => {
    const subject = album();
    subject.setTextBlock(0, block("t1"));
    subject.setTextBlock(0, block("t1", { text: "Brașov, 2026" }));
    assert.equal(subject.spreads[0]?.texts?.length, 1);
    assert.equal(subject.spreads[0]?.texts?.[0]?.text, "Brașov, 2026");
  });

  it("keeps a block inside the spread", () => {
    const subject = album();
    subject.setTextBlock(0, block("t1", { x: 0.9, width: 0.4 }));
    const placed = subject.spreads[0]!.texts![0]!;
    assert.ok(placed.x + placed.width <= 1);
  });

  it("removes a block", () => {
    const subject = album();
    subject.setTextBlock(0, block("t1"));
    subject.removeTextBlock(0, "t1");
    assert.deepEqual(subject.spreads[0]?.texts, []);
  });

  it("caps how many blocks one spread holds", () => {
    const subject = album();
    for (let i = 0; i < MAX_TEXT_BLOCKS_PER_SPREAD; i++) subject.setTextBlock(0, block(`t${i}`));
    assert.throws(() => subject.setTextBlock(0, block("one-too-many")));
  });

  it("keeps the words when the spread changes layout", () => {
    const subject = album();
    subject.setTextBlock(0, block("t1"));
    subject.changeTemplate(0, "hero-full-bleed");
    assert.equal(subject.spreads[0]?.texts?.length, 1);
  });

  it("cannot change an approved album", () => {
    const subject = album();
    subject.approve();
    assert.throws(() => subject.setTextBlock(0, block("t1")), AlbumLockedError);
  });
});

describe("album style and cover", () => {
  it("starts a new album filling its spreads, with no cover", () => {
    const subject = album();
    assert.deepEqual(subject.style, NEW_ALBUM_STYLE);
    assert.equal(subject.style.spacing, "full");
    assert.equal(subject.cover, null);
  });

  it("keeps albums stored before styles existed on the classic look", () => {
    assert.equal(DEFAULT_STYLE.spacing, "classic");
  });

  it("sets and clears a cover", () => {
    const subject = album();
    subject.setCover({
      layout: "photo",
      photoId: UniqueEntityId.create().toString(),
      crop: { x: 0, y: 0, width: 1, height: 1 },
      title: "Ana & Mihai",
      subtitle: "14.09.2026",
    });
    assert.equal(subject.cover?.title, "Ana & Mihai");
    subject.setCover(null);
    assert.equal(subject.cover, null);
  });

  it("applies style, text and cover edits through the edit use case, undo included", async () => {
    const albums = new InMemoryAlbumRepository();
    const subject = album();
    await albums.save(subject);
    const edit = new EditAlbumUseCase(albums);
    const id = subject.id.toString();

    const parse = (command: unknown) => albumEditSchema.parse(command);
    assert.ok((await edit.execute(id, parse({ type: "SET_STYLE", style: STYLE_PRESETS.midnight }))).isSuccess);
    assert.ok(
      (await edit.execute(id, parse({ type: "SET_TEXT_BLOCK", spreadIndex: 0, block: block("t1") }))).isSuccess,
    );

    const snapshot = structuredClone([...subject.spreads]);
    await edit.execute(id, parse({ type: "REMOVE_TEXT_BLOCK", spreadIndex: 0, blockId: "t1" }));
    // Undo sends the earlier spreads back; the text must come back with them.
    await edit.execute(id, parse({ type: "RESTORE_SPREADS", spreads: snapshot }));

    const saved = await albums.findById(subject.id);
    assert.equal(saved?.style.preset, "midnight");
    assert.equal(saved?.spreads[0]?.texts?.[0]?.id, "t1");
  });
});

describe("shared layout geometry", () => {
  const slot = { id: "a", x: 0.1, y: 0.1, width: 0.3, height: 0.8 };
  const { id: _id, ...rect } = slot;
  const layout = { fullBleed: false, slots: [slot] };

  it("leaves classic spacing and full-bleed layouts exactly where the template puts them", () => {
    assert.deepEqual(spacedSlotRect(slot, layout, "classic"), rect);
    assert.deepEqual(spacedSlotRect(slot, { fullBleed: true, slots: [slot] }, "airy"), rect);
    assert.deepEqual(spacedSlotRect(slot, { fullBleed: true, slots: [slot] }, "full"), rect);
  });

  describe("full spacing, over every layout in the library", () => {
    const full = LAYOUT_TEMPLATES.filter((template) => !template.fullBleed).map((template) => ({
      template,
      rects: template.slots.map((candidate) => spacedSlotRect(candidate, template, "full")),
    }));
    const area = (rects: { width: number; height: number }[]) =>
      rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);

    it("never lets two photos overlap", () => {
      for (const { template, rects } of full) {
        rects.forEach((a, i) =>
          rects.slice(i + 1).forEach((b) => {
            const overlap =
              a.x < b.x + b.width - 1e-9 &&
              b.x < a.x + a.width - 1e-9 &&
              a.y < b.y + b.height - 1e-9 &&
              b.y < a.y + a.height - 1e-9;
            assert.ok(!overlap, `${template.id} has overlapping photos`);
          }),
        );
      }
    });

    it("keeps every photo inside the thin margin", () => {
      for (const { template, rects } of full) {
        for (const rect of rects) {
          assert.ok(
            rect.x >= FULL_MARGIN.x - 1e-9 && rect.x + rect.width <= 1 - FULL_MARGIN.x + 1e-9,
            `${template.id} runs past the side margin`,
          );
          assert.ok(
            rect.y >= FULL_MARGIN.y - 1e-9 && rect.y + rect.height <= 1 - FULL_MARGIN.y + 1e-9,
            `${template.id} runs past the top or bottom`,
          );
        }
      }
    });

    it("never moves a photo onto the fold that the layout kept off it", () => {
      const crosses = (rect: { x: number; width: number }) => rect.x < 0.5 && rect.x + rect.width > 0.5;
      for (const { template, rects } of full) {
        template.slots.forEach((original, i) => {
          if (!crosses(original)) assert.ok(!crosses(rects[i]!), `${template.id}/${original.id} now crosses the fold`);
        });
      }
    });

    it("keeps every photo's shape within the stretch limit", () => {
      for (const { template, rects } of full) {
        template.slots.forEach((original, i) => {
          const stretch = rects[i]!.width / rects[i]!.height / (original.width / original.height);
          assert.ok(
            Math.max(stretch, 1 / stretch) <= FULL_MAX_STRETCH + 1e-9,
            `${template.id}/${original.id} stretched ${stretch.toFixed(2)}×`,
          );
        });
      }
    });

    it("fills more of the spread than classic, most multi-photo spreads at least 80%", () => {
      for (const { template, rects } of full) {
        assert.ok(area(rects) >= area(template.slots) - 1e-9, `${template.id} lost space`);
      }
      const multi = full
        .filter(({ template }) => template.slots.length > 1)
        .map(({ rects }) => area(rects))
        .sort((a, b) => a - b);
      assert.ok(
        multi[Math.floor(multi.length / 2)]! >= 0.8,
        "the median multi-photo spread should be at least 80% photo",
      );
    });
  });

  it("draws airy layouts in towards the centre", () => {
    const airy = spacedSlotRect(slot, layout, "airy");
    assert.ok(airy.x > slot.x);
    assert.equal(airy.width, slot.width * AIRY_SCALE);
  });

  it("picks readable text colours for light and dark paper", () => {
    assert.equal(textColorOn("#ffffff"), "#1d1f22");
    assert.equal(textColorOn("#1b1c1f"), "#f3f1ec");
  });
});
