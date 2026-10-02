import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analysisProgress, shootsRefreshInterval } from "./shoot-progress";

describe("analysisProgress", () => {
  it("shows how many photos are analysed out of the total while some are still processing", () => {
    assert.deepEqual(analysisProgress({ photoCount: 248, processingCount: 68 }), { done: 180, total: 248 });
  });

  it("starts at zero when nothing is analysed yet", () => {
    assert.deepEqual(analysisProgress({ photoCount: 12, processingCount: 12 }), { done: 0, total: 12 });
  });

  it("is null once every photo is done, so the card shows the plain total", () => {
    assert.equal(analysisProgress({ photoCount: 248, processingCount: 0 }), null);
  });

  it("is null for an empty shoot", () => {
    assert.equal(analysisProgress({ photoCount: 0, processingCount: 0 }), null);
  });
});

describe("shootsRefreshInterval", () => {
  it("refreshes while any shoot is still being analysed", () => {
    assert.equal(shootsRefreshInterval([{ processingCount: 0 }, { processingCount: 3 }]), 5000);
  });

  it("stops refreshing when every shoot is done, or before the list has loaded", () => {
    assert.equal(shootsRefreshInterval([{ processingCount: 0 }]), false);
    assert.equal(shootsRefreshInterval(undefined), false);
  });
});
