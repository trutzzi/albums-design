import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Album, MIN_FRAME_SIZE, SlotNotFoundError } from "../src/modules/album-composition/domain/album";
import { findTemplate } from "../src/modules/album-composition/domain/layout-template";
import { AlbumCompositionExportGateway } from "../src/modules/export-print/infrastructure/gateways/album-gateway";
import { InMemoryAlbumRepository } from "./support/in-memory";

const FULL = { x: 0, y: 0, width: 1, height: 1 };

function albumWithPair(): Album {
  return Album.create({
    projectId: UniqueEntityId.create(),
    title: "Frames",
    spreads: [
      {
        templateId: "portrait-pair",
        placements: [
          { slotId: "left", photoId: "photo-a", crop: FULL, treatment: "COLOR" },
          {
            slotId: "right",
            photoId: "photo-b",
            crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
            treatment: "BLACK_WHITE",
          },
        ],
      },
    ],
  });
}

describe("swapping two photos on a spread", () => {
  it("exchanges the photos", () => {
    const album = albumWithPair();
    album.swapPlacements(0, "left", "right");
    const [left, right] = album.spreads[0]!.placements;
    assert.equal(left?.photoId, "photo-b");
    assert.equal(right?.photoId, "photo-a");
  });

  it("carries each photo's own framing and treatment with it", () => {
    const album = albumWithPair();
    album.swapPlacements(0, "left", "right");
    const [left, right] = album.spreads[0]!.placements;
    // The black-and-white photo takes its treatment and crop to its new slot.
    assert.equal(left?.treatment, "BLACK_WHITE");
    assert.deepEqual(left?.crop, { x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
    assert.equal(right?.treatment, "COLOR");
    assert.deepEqual(right?.crop, FULL);
  });

  it("leaves the slot rectangles alone — the photos move, not the layout", () => {
    const album = albumWithPair();
    album.setFrame(0, "left", { x: 0.02, y: 0.02, width: 0.3, height: 0.3 });
    album.swapPlacements(0, "left", "right");
    assert.deepEqual(album.spreads[0]?.placements[0]?.frame, {
      x: 0.02,
      y: 0.02,
      width: 0.3,
      height: 0.3,
    });
    assert.equal(album.spreads[0]?.placements[1]?.frame, undefined);
  });

  it("is a no-op onto itself and rejects a slot that is not there", () => {
    const album = albumWithPair();
    album.swapPlacements(0, "left", "left");
    assert.equal(album.spreads[0]?.placements[0]?.photoId, "photo-a");
    assert.throws(() => album.swapPlacements(0, "left", "nope"), SlotNotFoundError);
  });
});

function albumWithThree(): Album {
  return Album.create({
    projectId: UniqueEntityId.create(),
    title: "Three bands",
    spreads: [
      {
        templateId: "stack-three",
        placements: [
          { slotId: "b1", photoId: "photo-a", crop: FULL, treatment: "COLOR" },
          { slotId: "b2", photoId: "photo-b", crop: FULL, treatment: "COLOR" },
          {
            slotId: "b3",
            photoId: "photo-c",
            crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
            treatment: "BLACK_WHITE",
          },
        ],
      },
    ],
  });
}

describe("reordering a placement by dragging it onto another slot", () => {
  it("shifts the photos in between instead of trading places 1:1", () => {
    const album = albumWithThree();
    album.reorderPlacement(0, "b1", "b3");
    const [b1, b2, b3] = album.spreads[0]!.placements;
    // photo-a lands exactly where photo-c was; b and c both shift back one slot —
    // a straight swap would instead have left photo-b in the middle untouched.
    assert.equal(b1?.photoId, "photo-b");
    assert.equal(b2?.photoId, "photo-c");
    assert.equal(b3?.photoId, "photo-a");
  });

  it("shifts the other way when dragging a later photo earlier", () => {
    const album = albumWithThree();
    album.reorderPlacement(0, "b3", "b1");
    const [b1, b2, b3] = album.spreads[0]!.placements;
    assert.equal(b1?.photoId, "photo-c");
    assert.equal(b2?.photoId, "photo-a");
    assert.equal(b3?.photoId, "photo-b");
  });

  it("carries the moved photo's framing and treatment with it", () => {
    const album = albumWithThree();
    album.reorderPlacement(0, "b1", "b3");
    const [, , b3] = album.spreads[0]!.placements;
    assert.equal(b3?.treatment, "COLOR");
    assert.deepEqual(b3?.crop, FULL);
  });

  it("leaves the slot rectangles alone — the photos move, not the layout", () => {
    const album = albumWithThree();
    album.setFrame(0, "b1", { x: 0.02, y: 0.02, width: 0.3, height: 0.3 });
    album.reorderPlacement(0, "b1", "b3");
    // The hand-drawn frame stays attached to slot b1's position, not to the photo.
    assert.deepEqual(album.spreads[0]?.placements[0]?.frame, {
      x: 0.02,
      y: 0.02,
      width: 0.3,
      height: 0.3,
    });
  });

  it("is a no-op onto itself and rejects a slot that is not there", () => {
    const album = albumWithThree();
    album.reorderPlacement(0, "b1", "b1");
    assert.equal(album.spreads[0]?.placements[0]?.photoId, "photo-a");
    assert.throws(() => album.reorderPlacement(0, "b1", "nope"), SlotNotFoundError);
    assert.throws(() => album.reorderPlacement(0, "nope", "b1"), SlotNotFoundError);
  });
});

describe("resizing a slot", () => {
  it("records the new rectangle", () => {
    const album = albumWithPair();
    album.setFrame(0, "left", { x: 0.1, y: 0.1, width: 0.35, height: 0.6 });
    assert.deepEqual(album.spreads[0]?.placements[0]?.frame, {
      x: 0.1,
      y: 0.1,
      width: 0.35,
      height: 0.6,
    });
  });

  it("clamps a rectangle that would leave the page or collapse", () => {
    const album = albumWithPair();
    album.setFrame(0, "left", { x: 0.9, y: -0.5, width: 0.8, height: 0.001 });
    const frame = album.spreads[0]?.placements[0]?.frame;
    assert.ok(frame);
    assert.ok(frame.x >= 0 && frame.x + frame.width <= 1 + 1e-9);
    assert.ok(frame.y >= 0 && frame.y + frame.height <= 1 + 1e-9);
    assert.ok(frame.height >= MIN_FRAME_SIZE);
  });

  it("restores the template rectangles on reset", () => {
    const album = albumWithPair();
    album.setFrame(0, "left", { x: 0.1, y: 0.1, width: 0.35, height: 0.6 });
    album.setFrame(0, "right", { x: 0.5, y: 0.1, width: 0.35, height: 0.6 });
    album.resetFrames(0);
    for (const placement of album.spreads[0]!.placements) {
      assert.equal(placement.frame, undefined);
    }
  });

  it("drops hand-drawn rectangles when the layout changes underneath them", () => {
    const album = albumWithPair();
    album.setFrame(0, "left", { x: 0.1, y: 0.1, width: 0.35, height: 0.6 });
    album.changeTemplate(0, "landscape-stack");
    for (const placement of album.spreads[0]!.placements) {
      assert.equal(placement.frame, undefined, "a frame outlived the template it described");
    }
  });
});

describe("resized frames reach the printer", () => {
  it("hands the export gateway the override, not the template rectangle", async () => {
    const albums = new InMemoryAlbumRepository();
    const album = albumWithPair();
    const custom = { x: 0.11, y: 0.12, width: 0.33, height: 0.44 };
    album.setFrame(0, "left", custom);
    await albums.save(album);

    const renderable = await new AlbumCompositionExportGateway(albums).load(album.id.toString());
    const placements = renderable?.spreads[0]?.placements ?? [];

    assert.deepEqual(placements[0]?.frame, custom);
    assert.equal(placements[1]?.frame, undefined);

    // The untouched slot must still match what the template says.
    const templateSlot = findTemplate("portrait-pair")?.slots[1];
    assert.ok(templateSlot);
    assert.equal(templateSlot.id, placements[1]?.slotId);
  });
});
