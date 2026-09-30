import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { focusedBaseCrop, isUntouchedCrop } from "@albumflow/contracts";
import { SharpImageInspector } from "../src/modules/photo-intelligence/infrastructure/vision/sharp-image-inspector";

/** A dark frame with one warm, skin-toned patch — where a face would be. */
async function photoWithSubjectAt(width: number, height: number, cx: number, cy: number): Promise<Uint8Array> {
  const pixels = Buffer.alloc(width * height * 3, 35);
  const radius = Math.round(Math.min(width, height) * 0.1);
  for (let y = cy - radius; y < cy + radius; y++) {
    for (let x = cx - radius; x < cx + radius; x++) {
      const i = (y * width + x) * 3;
      pixels[i] = 225;
      pixels[i + 1] = 160;
      pixels[i + 2] = 125;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

// sharp scores the photo in coarse regions, so the point it reports can sit up to about a
// tenth of the photo away from the subject's centre — close enough to frame it.
const NEAR = 0.12;

describe("subject focus", () => {
  it("finds the subject of a landscape photo", async () => {
    const metrics = await new SharpImageInspector().inspect(await photoWithSubjectAt(900, 600, 700, 200));
    assert.ok(Math.abs(metrics.focus.x - 700 / 900) < NEAR, `x was ${metrics.focus.x}`);
    assert.ok(Math.abs(metrics.focus.y - 200 / 600) < NEAR, `y was ${metrics.focus.y}`);
  });

  it("finds the subject of a portrait photo", async () => {
    const metrics = await new SharpImageInspector().inspect(await photoWithSubjectAt(600, 900, 150, 250));
    assert.ok(Math.abs(metrics.focus.x - 150 / 600) < NEAR, `x was ${metrics.focus.x}`);
    assert.ok(Math.abs(metrics.focus.y - 250 / 900) < NEAR, `y was ${metrics.focus.y}`);
  });
});

describe("focusedBaseCrop", () => {
  it("is the plain centred cover crop without a subject", () => {
    assert.deepEqual(focusedBaseCrop(1.5, 1, null), { x: (1 - 1 / 1.5) / 2, y: 0, width: 1 / 1.5, height: 1 });
  });

  it("slides the crop towards the subject", () => {
    // A 3:2 landscape into a square slot, subject right of centre.
    const crop = focusedBaseCrop(1.5, 1, { x: 0.6, y: 0.5 });
    assert.equal(crop.width, 1 / 1.5);
    assert.ok(Math.abs(crop.x + crop.width / 2 - 0.6) < 1e-9, "centred on the subject");
  });

  it("never runs past the photo's edges", () => {
    const right = focusedBaseCrop(1.5, 1, { x: 0.98, y: 0.5 });
    assert.ok(Math.abs(right.x + right.width - 1) < 1e-9);
    const top = focusedBaseCrop(0.66, 1, { x: 0.5, y: 0.01 });
    assert.equal(top.y, 0);
  });

  it("recognises a crop nobody framed by hand", () => {
    assert.equal(isUntouchedCrop({ x: 0, y: 0, width: 1, height: 1 }), true);
    assert.equal(isUntouchedCrop({ x: 0.1, y: 0, width: 0.8, height: 1 }), false);
  });
});
