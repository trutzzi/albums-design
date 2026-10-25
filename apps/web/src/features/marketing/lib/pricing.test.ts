import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanDto } from "@/shared/api";
import { hasLaunchDiscount, isRecommended, isTrial, planHighlights } from "./pricing";

const base: PlanDto = {
  code: "TRIAL",
  name: "Free trial",
  monthlyPriceEur: 0,
  regularPriceEur: 0,
  launchPriceEur: 0,
  launchPricesUntil: "2027-01-02T00:00:00.000Z",
  albumsPerPeriod: 1,
  seats: 1,
  watermarkDrafts: true,
  watermarkExports: true,
  maxPhotosPerShoot: 80,
  clientDownloadLinks: false,
  clientSlideshows: false,
};

describe("planHighlights", () => {
  it("never says '1 albums' or '1 team seats' for the trial", () => {
    assert.deepEqual(
      planHighlights(base).map((line) => line.key),
      [
        "landing.pricing.oneAlbum",
        "studio.plan.photos",
        "landing.pricing.oneSeat",
        "studio.plan.watermarked",
        "studio.plan.watermarkedExports",
      ],
    );
  });

  it("lists what clients receive and unlimited allowances on Studio", () => {
    const studio: PlanDto = {
      ...base,
      code: "STUDIO",
      albumsPerPeriod: 15,
      seats: 3,
      maxPhotosPerShoot: null,
      watermarkDrafts: false,
      watermarkExports: false,
      clientDownloadLinks: true,
      clientSlideshows: true,
    };
    assert.deepEqual(planHighlights(studio), [
      { key: "studio.plan.albums", params: { count: 15 } },
      { key: "studio.plan.photosUnlimited" },
      { key: "studio.plan.seats", params: { count: 3 } },
      { key: "studio.plan.downloadLinks" },
      { key: "landing.pricing.slideshows" },
      { key: "studio.plan.noWatermark" },
    ]);
    assert.ok(isRecommended(studio));
    assert.ok(!isRecommended(base));
  });

  it("strikes the list price only while the launch price is lower", () => {
    assert.ok(hasLaunchDiscount({ ...base, monthlyPriceEur: 10, regularPriceEur: 20 }));
    assert.ok(!hasLaunchDiscount({ ...base, monthlyPriceEur: 20, regularPriceEur: 20 }));
  });
});

describe("isTrial", () => {
  it("knows the trial by its code, not its price", () => {
    assert.ok(isTrial(base));
    assert.ok(!isTrial({ ...base, code: "STARTER", monthlyPriceEur: 0 }));
  });
});
