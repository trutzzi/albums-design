import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { nextRotation, rotatedAspect, rotatedFocus } from "@albumflow/contracts";
import { Album } from "../src/modules/album-composition/domain/album";
import { rasterisePhoto } from "../src/modules/export-print/infrastructure/rendering/photo-raster";

const FULL = { x: 0, y: 0, width: 1, height: 1 };
const ZOOMED = { x: 0.2, y: 0.1, width: 0.5, height: 0.5 };

function album(): Album {
  return Album.create({
    projectId: UniqueEntityId.create(),
    title: "Rotation test",
    spreads: [
      {
        templateId: "pair-portrait",
        placements: [
          { slotId: "left", photoId: "photo-a", crop: ZOOMED, treatment: "COLOR" },
          { slotId: "right", photoId: "photo-b", crop: FULL, treatment: "COLOR" },
        ],
      },
    ],
  });
}

const placementOf = (a: Album, slotId: string) => a.spreads[0]!.placements.find((p) => p.slotId === slotId)!;
const photoIn = (a: Album, photoId: string) => a.spreads[0]!.placements.find((p) => p.photoId === photoId)!;

/** Left half red, right half blue, 600 x 400 — so a turn is easy to see in the pixels. */
async function halves(orientation?: number): Promise<Buffer> {
  const width = 600;
  const height = 400;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (x < width / 2) data[i] = 255;
      else data[i + 2] = 255;
    }
  }
  const image = sharp(data, { raw: { width, height, channels: 3 } });
  return (orientation ? image.withMetadata({ orientation }) : image).jpeg({ quality: 95 }).toBuffer();
}

function colourAt(raw: { data: Buffer; width: number; channels: number }, x: number, y: number): "red" | "blue" {
  const i = (y * raw.width + x) * raw.channels;
  return raw.data[i]! > raw.data[i + 2]! ? "red" : "blue";
}

describe("rotation helpers", () => {
  it("turns clockwise in quarter steps and back to upright", () => {
    assert.deepEqual(
      [nextRotation(undefined), nextRotation(90), nextRotation(180), nextRotation(270)],
      [90, 180, 270, 0],
    );
  });

  it("swaps width and height for a quarter turn only", () => {
    assert.equal(rotatedAspect(1.5, 90), 1 / 1.5);
    assert.equal(rotatedAspect(1.5, 270), 1 / 1.5);
    assert.equal(rotatedAspect(1.5, 180), 1.5);
    assert.equal(rotatedAspect(1.5, undefined), 1.5);
  });

  it("moves the subject with the photo: top-left goes to top-right on a clockwise quarter", () => {
    assert.deepEqual(rotatedFocus({ x: 0, y: 0 }, 90), { x: 1, y: 0 });
    assert.deepEqual(rotatedFocus({ x: 0.25, y: 0.5 }, 180), { x: 0.75, y: 0.5 });
    assert.deepEqual(rotatedFocus({ x: 1, y: 0 }, 270), { x: 0, y: 0 });
    assert.equal(rotatedFocus(null, 90), null);
  });
});

describe("Album.setRotation", () => {
  it("turns the photo and starts it centred again, since the old crop was cut the other way up", () => {
    const a = album();
    a.setRotation(0, "left", 90);
    assert.equal(placementOf(a, "left").rotation, 90);
    assert.deepEqual(placementOf(a, "left").crop, FULL);
  });

  it("stores upright as no field, like albums saved before rotation existed", () => {
    const a = album();
    a.setRotation(0, "left", 90);
    a.setRotation(0, "left", 0);
    assert.equal("rotation" in placementOf(a, "left"), false);
  });

  it("changes nothing when the photo already has that turn", () => {
    const a = album();
    a.setRotation(0, "left", 0);
    assert.deepEqual(placementOf(a, "left").crop, ZOOMED);
  });

  it("travels with the photo when photos trade places, are reordered or the layout changes", () => {
    const swapped = album();
    swapped.setRotation(0, "left", 270);
    swapped.swapPlacements(0, "left", "right");
    assert.equal(photoIn(swapped, "photo-a").rotation, 270);
    assert.equal("rotation" in photoIn(swapped, "photo-b"), false);

    const reordered = album();
    reordered.setRotation(0, "left", 180);
    reordered.reorderPlacement(0, "left", "right");
    assert.equal(photoIn(reordered, "photo-a").rotation, 180);
    assert.equal("rotation" in photoIn(reordered, "photo-b"), false);

    const relaid = album();
    relaid.setRotation(0, "right", 90);
    relaid.changeTemplate(0, "quad");
    assert.equal(photoIn(relaid, "photo-b").rotation, 90);
  });

  it("is dropped when a different photo goes into the slot", () => {
    const a = album();
    a.setRotation(0, "left", 90);
    a.swapPhoto(0, "left", "photo-c");
    assert.equal("rotation" in placementOf(a, "left"), false);
  });
});

describe("rasterisePhoto with a turned photo", () => {
  it("prints the photo turned a quarter clockwise: what was on the left is now on top", async () => {
    const source = await halves();
    const raw = await rasterisePhoto(
      { resolve: async () => source },
      { slotId: "s", photoId: "p", crop: FULL, treatment: "COLOR", rotation: 90 },
      { width: 200, height: 300 },
      undefined,
      "raw",
    );
    assert.ok(raw);
    assert.equal(colourAt(raw, 100, 20), "red");
    assert.equal(colourAt(raw, 100, 280), "blue");
  });

  it("cuts the crop from the turned photo", async () => {
    const source = await halves();
    // The top third of the turned photo is all red.
    const raw = await rasterisePhoto(
      { resolve: async () => source },
      { slotId: "s", photoId: "p", crop: { x: 0, y: 0, width: 1, height: 1 / 3 }, treatment: "COLOR", rotation: 90 },
      { width: 200, height: 100 },
      undefined,
      "raw",
    );
    assert.ok(raw);
    assert.equal(colourAt(raw, 10, 90), "red");
    assert.equal(colourAt(raw, 190, 10), "red");
  });

  it("measures a photo stored sideways with a camera orientation tag as it is shown, upright", async () => {
    // Orientation 6: stored 600 x 400, shown turned a quarter clockwise as 400 x 600.
    const source = await halves(6);
    const raw = await rasterisePhoto(
      { resolve: async () => source },
      { slotId: "s", photoId: "p", crop: FULL, treatment: "COLOR" },
      { width: 200, height: 300 },
      undefined,
      "raw",
    );
    assert.ok(raw);
    assert.equal(colourAt(raw, 100, 20), "red");
    assert.equal(colourAt(raw, 100, 280), "blue");
  });

  it("adds the photographer's turn on top of the camera's", async () => {
    const source = await halves(6);
    // Shown upright with red on top; turned a further quarter, red ends up on the right.
    const raw = await rasterisePhoto(
      { resolve: async () => source },
      { slotId: "s", photoId: "p", crop: FULL, treatment: "COLOR", rotation: 90 },
      { width: 300, height: 200 },
      undefined,
      "raw",
    );
    assert.ok(raw);
    assert.equal(colourAt(raw, 280, 100), "red");
    assert.equal(colourAt(raw, 20, 100), "blue");
  });
});
