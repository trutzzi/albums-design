import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Photo } from "../src/modules/media-ingestion/domain/photo";
import { InMemoryPhotoRepository } from "../src/dev/in-memory-adapters";

/**
 * Reproduces the exact bug a CI run surfaced: analysis and derivative
 * generation are two independent, concurrent BullMQ jobs against the same
 * photo row, each starting from its own `findById` snapshot. If either
 * persisted by re-saving that whole snapshot, whichever job committed last
 * would silently revert the other's field — status back to
 * ANALYSIS_QUEUED after derivatives saved, or hasDerivatives back to false
 * after analysis saved — depending on nothing but timing.
 *
 * These drive the repository directly, not through the gateway/use-case
 * classes: both of those do their own internal findById immediately before
 * persisting, which would silently re-read fresh state and defeat any
 * attempt to control the interleaving from outside.
 */
async function uploadedPhoto(photos: InMemoryPhotoRepository): Promise<Photo> {
  const photo = Photo.requestUpload({
    projectId: UniqueEntityId.create(),
    studioId: UniqueEntityId.create(),
    fileName: "race.jpg",
    mimeType: "image/jpeg",
    byteSize: 1,
  });
  photo.markUploaded({ byteSize: 1 });
  photo.markAnalysisQueued();
  await photos.save(photo);
  return photo;
}

describe("the analysis/derivatives race on a shared photo row", () => {
  it("documents the bug: two save() calls really do clobber each other", async () => {
    const photos = new InMemoryPhotoRepository();
    const photo = await uploadedPhoto(photos);

    // Both "workers" read their own snapshot before either writes anything.
    const forAnalysis = await photos.findById(photo.id);
    const forDerivatives = await photos.findById(photo.id);
    assert.ok(forAnalysis && forDerivatives);

    forAnalysis.markAnalysed();
    await photos.save(forAnalysis); // the old, buggy call

    forDerivatives.markDerivativesReady();
    await photos.save(forDerivatives); // the old, buggy call — reverts status

    const final = await photos.findById(photo.id);
    assert.equal(
      final?.status,
      "ANALYSIS_QUEUED",
      "if this ever stops reproducing, something about save() itself changed",
    );
    assert.equal(final?.hasDerivatives, true);
  });

  it("keeps both fields when analysis commits, then derivatives", async () => {
    const photos = new InMemoryPhotoRepository();
    const photo = await uploadedPhoto(photos);

    const forAnalysis = await photos.findById(photo.id);
    const forDerivatives = await photos.findById(photo.id);
    assert.ok(forAnalysis && forDerivatives);

    forAnalysis.markAnalysed();
    await photos.updateStatus(photo.id, forAnalysis.status);

    // Derivatives commits second, using the snapshot it read BEFORE
    // analysis committed anything — the exact interleaving that broke the
    // whole-object save().
    forDerivatives.markDerivativesReady();
    await photos.markDerivativesReady(photo.id);

    const final = await photos.findById(photo.id);
    assert.equal(final?.status, "ANALYSED", "derivatives' commit reverted the status");
    assert.equal(final?.hasDerivatives, true);
  });

  it("keeps both fields when derivatives commits, then analysis", async () => {
    const photos = new InMemoryPhotoRepository();
    const photo = await uploadedPhoto(photos);

    const forAnalysis = await photos.findById(photo.id);
    const forDerivatives = await photos.findById(photo.id);
    assert.ok(forAnalysis && forDerivatives);

    forDerivatives.markDerivativesReady();
    await photos.markDerivativesReady(photo.id);

    forAnalysis.markAnalysed();
    await photos.updateStatus(photo.id, forAnalysis.status);

    const final = await photos.findById(photo.id);
    assert.equal(final?.status, "ANALYSED");
    assert.equal(final?.hasDerivatives, true, "analysis' commit reverted the derivatives flag");
  });
});
