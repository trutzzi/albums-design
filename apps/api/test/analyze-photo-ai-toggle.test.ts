import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { AnalyzePhotoUseCase } from "../src/modules/photo-intelligence/application/use-cases/analyze-photo/analyze-photo.use-case";
import { InMemoryPhotoAnalysisRepository } from "../src/dev/in-memory-adapters";
import type { ImageInspector, ImageMetrics } from "../src/modules/photo-intelligence/application/ports/image-inspector";
import type { PhotoByteSource } from "../src/modules/photo-intelligence/application/ports/photo-source";
import type { PhotoLifecycle } from "../src/modules/photo-intelligence/application/ports/photo-lifecycle";
import type { VisionClassifier } from "../src/modules/photo-intelligence/application/ports/vision-classifier";

const METRICS: ImageMetrics = {
  width: 100,
  height: 100,
  sharpness: 70,
  exposure: 70,
  composition: 60,
  saturation: 0.4,
  skinToneRatio: 0.1,
  capturedAt: undefined,
  histogram: [],
};

const inspector: ImageInspector = { inspect: async () => METRICS };
const bytes: PhotoByteSource = { read: async () => new Uint8Array() };
const lifecycle: PhotoLifecycle = { markAnalysed: async () => {} };

function classifierNamed(category: "PORTRAIT" | "GROUP"): VisionClassifier {
  return {
    classify: async () => ({ category, confidence: 0.9, faceCount: 1, faceQuality: 80 }),
    isAvailable: async () => true,
  };
}

describe("AnalyzePhotoUseCase — which classifier runs", () => {
  it("uses the default classifier when the uploader did not opt into AI", async () => {
    const useCase = new AnalyzePhotoUseCase(
      new InMemoryPhotoAnalysisRepository(),
      bytes,
      inspector,
      classifierNamed("PORTRAIT"),
      classifierNamed("GROUP"),
      lifecycle,
    );
    const result = await useCase.execute({
      photoId: UniqueEntityId.create().toString(),
      projectId: UniqueEntityId.create().toString(),
      storageKey: "k",
      useAi: false,
    });
    assert.ok(result.isSuccess);
    assert.equal(result.getValue().category, "PORTRAIT");
  });

  it("uses the AI classifier once the uploader opts in", async () => {
    const useCase = new AnalyzePhotoUseCase(
      new InMemoryPhotoAnalysisRepository(),
      bytes,
      inspector,
      classifierNamed("PORTRAIT"),
      classifierNamed("GROUP"),
      lifecycle,
    );
    const result = await useCase.execute({
      photoId: UniqueEntityId.create().toString(),
      projectId: UniqueEntityId.create().toString(),
      storageKey: "k",
      useAi: true,
    });
    assert.ok(result.isSuccess);
    assert.equal(result.getValue().category, "GROUP");
  });

  it("defaults to the non-AI classifier when the flag is omitted entirely", async () => {
    const useCase = new AnalyzePhotoUseCase(
      new InMemoryPhotoAnalysisRepository(),
      bytes,
      inspector,
      classifierNamed("PORTRAIT"),
      classifierNamed("GROUP"),
      lifecycle,
    );
    const result = await useCase.execute({
      photoId: UniqueEntityId.create().toString(),
      projectId: UniqueEntityId.create().toString(),
      storageKey: "k",
    });
    assert.ok(result.isSuccess);
    assert.equal(result.getValue().category, "PORTRAIT");
  });
});
