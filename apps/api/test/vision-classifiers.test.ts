import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import sharp from "sharp";
import { FallbackVisionClassifier } from "../src/modules/photo-intelligence/infrastructure/vision/fallback-vision-classifier";
import { OllamaVisionClassifier } from "../src/modules/photo-intelligence/infrastructure/vision/ollama-vision-classifier";
import { HeuristicVisionClassifier } from "../src/modules/photo-intelligence/infrastructure/vision/heuristic-vision-classifier";
import type { VisionClassifier, VisionVerdict } from "../src/modules/photo-intelligence/application/ports/vision-classifier";

const SOME_VERDICT: VisionVerdict = {
  category: "PORTRAIT",
  confidence: 0.9,
  faceCount: 1,
  faceQuality: 80,
};

function stubClassifier(overrides: Partial<VisionClassifier> = {}): VisionClassifier {
  return {
    classify: async () => SOME_VERDICT,
    isAvailable: async () => true,
    ...overrides,
  };
}

describe("HeuristicVisionClassifier", () => {
  it("reports itself unavailable — it isn't AI, so it must never look like AI is online", async () => {
    assert.equal(await new HeuristicVisionClassifier().isAvailable(), false);
  });
});

describe("FallbackVisionClassifier", () => {
  it("uses the primary classifier when it succeeds", async () => {
    const classifier = new FallbackVisionClassifier(stubClassifier(), stubClassifier());
    const result = await classifier.classify({ bytes: new Uint8Array(), metrics: {} as never });
    assert.equal(result.category, "PORTRAIT");
  });

  it("falls back when the primary throws, rather than rejecting", async () => {
    const primary = stubClassifier({
      classify: async () => {
        throw new Error("the Mac mini is unreachable");
      },
    });
    const classifier = new FallbackVisionClassifier(primary, new HeuristicVisionClassifier());
    const result = await classifier.classify({
      bytes: new Uint8Array(),
      metrics: { skinToneRatio: 0, composition: 0, saturation: 0, width: 10, height: 10, sharpness: 0 } as never,
    });
    // The heuristic's own logic, not the primary's — proves the fallback actually ran.
    assert.equal(result.category, "VENUE");
  });

  it("reports the primary's availability, not the fallback's", async () => {
    const primary = stubClassifier({ isAvailable: async () => false });
    const classifier = new FallbackVisionClassifier(primary, stubClassifier());
    assert.equal(await classifier.isAvailable(), false);
  });
});

describe("OllamaVisionClassifier", () => {
  it("parses a valid verdict out of Ollama's response envelope", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          response: JSON.stringify({
            category: "CEREMONY",
            confidence: 0.72,
            face_count: 2,
            face_quality: 55,
          }),
        }),
        { status: 200 },
      ),
    );

    const classifier = new OllamaVisionClassifier();
    const tinyJpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const verdict = await classifier.classify({ bytes: tinyJpeg, metrics: {} as never });

    assert.deepEqual(verdict, {
      category: "CEREMONY",
      confidence: 0.72,
      faceCount: 2,
      faceQuality: 55,
    });
  });

  it("accepts a category in the wrong case rather than rejecting it — a real model returned lowercase", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          response: JSON.stringify({ category: "portrait", confidence: 0.9, face_count: 1, face_quality: 80 }),
        }),
        { status: 200 },
      ),
    );

    const classifier = new OllamaVisionClassifier();
    const tinyJpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const verdict = await classifier.classify({ bytes: tinyJpeg, metrics: {} as never });
    assert.equal(verdict.category, "PORTRAIT");
  });

  it("rejects a category Ollama invented that isn't in the known list", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ response: JSON.stringify({ category: "PARTY", confidence: 0.5, face_count: 0, face_quality: 0 }) }), {
        status: 200,
      }),
    );

    const classifier = new OllamaVisionClassifier();
    const tinyJpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    await assert.rejects(() => classifier.classify({ bytes: tinyJpeg, metrics: {} as never }));
  });

  it("reports unavailable when the server can't be reached, without throwing", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("connection refused");
    });

    const classifier = new OllamaVisionClassifier();
    assert.equal(await classifier.isAvailable(), false);
  });

  it("reports available when the server responds", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));

    const classifier = new OllamaVisionClassifier();
    assert.equal(await classifier.isAvailable(), true);
  });
});
