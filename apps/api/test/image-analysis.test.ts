import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import sharp from "sharp";
import { SharpImageInspector } from "../src/modules/photo-intelligence/infrastructure/vision/sharp-image-inspector";
import { QualityScore } from "../src/modules/photo-intelligence/domain/value-objects/quality-score";

const WIDTH = 400;
const HEIGHT = 300;

/** Deterministic pseudo-random texture, so a run is reproducible. */
function noiseBuffer(seed: number): Buffer {
  const data = Buffer.alloc(WIDTH * HEIGHT * 3);
  let state = seed;
  for (let i = 0; i < data.length; i += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    data[i] = state % 256;
  }
  return data;
}

function flatBuffer(level: number): Buffer {
  return Buffer.alloc(WIDTH * HEIGHT * 3, level);
}

function toJpeg(raw: Buffer): Promise<Buffer> {
  return sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("SharpImageInspector", () => {
  const inspector = new SharpImageInspector();
  let sharpImage: Buffer;
  let blurredImage: Buffer;
  let darkImage: Buffer;
  let midGreyImage: Buffer;

  before(async () => {
    const texture = noiseBuffer(42);
    sharpImage = await toJpeg(texture);
    blurredImage = await sharp(texture, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
      .blur(8)
      .jpeg({ quality: 95 })
      .toBuffer();
    darkImage = await toJpeg(flatBuffer(6));
    midGreyImage = await toJpeg(flatBuffer(118));
  });

  it("reads real dimensions", async () => {
    const metrics = await inspector.inspect(sharpImage);
    assert.equal(metrics.width, WIDTH);
    assert.equal(metrics.height, HEIGHT);
  });

  it("scores a detailed frame far sharper than a blurred one", async () => {
    const crisp = await inspector.inspect(sharpImage);
    const blurred = await inspector.inspect(blurredImage);
    assert.ok(
      crisp.sharpness > blurred.sharpness + 25,
      `expected a clear gap, got crisp=${crisp.sharpness} blurred=${blurred.sharpness}`,
    );
  });

  it("penalises a crushed-black frame on exposure", async () => {
    const dark = await inspector.inspect(darkImage);
    const midtone = await inspector.inspect(midGreyImage);
    assert.ok(
      midtone.exposure > dark.exposure + 20,
      `expected midtones to beat shadows, got midtone=${midtone.exposure} dark=${dark.exposure}`,
    );
  });

  it("keeps every metric inside 0-100", async () => {
    const metrics = await inspector.inspect(sharpImage);
    for (const key of ["sharpness", "exposure", "composition"] as const) {
      assert.ok(metrics[key] >= 0 && metrics[key] <= 100, `${key} out of range: ${metrics[key]}`);
    }
    assert.ok(metrics.skinToneRatio >= 0 && metrics.skinToneRatio <= 1);
  });
});

describe("QualityScore", () => {
  it("weights sharpness heaviest", () => {
    const sharpFrame = QualityScore.fromComponents({
      sharpness: 90,
      exposure: 50,
      composition: 50,
      faceQuality: 50,
    });
    const softFrame = QualityScore.fromComponents({
      sharpness: 50,
      exposure: 90,
      composition: 50,
      faceQuality: 50,
    });
    assert.ok(sharpFrame.overall > softFrame.overall);
  });

  it("refuses to call a soft frame album-worthy however good the rest is", () => {
    const soft = QualityScore.fromComponents({
      sharpness: 20,
      exposure: 100,
      composition: 100,
      faceQuality: 100,
    });
    assert.equal(soft.isAlbumWorthy, false);
  });

  it("clamps out-of-range inputs instead of propagating them", () => {
    const score = QualityScore.fromComponents({
      sharpness: 150,
      exposure: -20,
      composition: Number.NaN,
      faceQuality: 50,
    });
    assert.equal(score.components.sharpness, 100);
    assert.equal(score.components.exposure, 0);
    assert.equal(score.components.composition, 0);
  });
});
