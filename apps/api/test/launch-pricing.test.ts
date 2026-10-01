import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAUNCH_PRICES_UNTIL,
  PLANS,
  currentPriceEur,
  hasLaunchPrice,
  monthlyPriceFor,
} from "../src/modules/identity/domain/plan";
import { computeBusinessStats } from "../src/modules/platform-admin/domain/business-stats";

const before = new Date(LAUNCH_PRICES_UNTIL.getTime() - 1);
const after = new Date(LAUNCH_PRICES_UNTIL.getTime() + 24 * 60 * 60 * 1000);

describe("launch prices", () => {
  it("lists the launch and regular price of every plan", () => {
    assert.deepEqual(
      Object.values(PLANS).map((plan) => [plan.code, plan.launchPriceEur, plan.regularPriceEur]),
      [
        ["TRIAL", 0, 0],
        ["STARTER", 5, 10],
        ["STUDIO", 10, 20],
        ["STUDIO_PRO", 13, 30],
      ],
    );
  });

  it("runs for three months from the 2 October 2026 relaunch", () => {
    assert.equal(LAUNCH_PRICES_UNTIL.toISOString(), "2027-01-02T00:00:00.000Z");
  });

  it("keeps the launch price for good for a studio that joined in time", () => {
    assert.equal(hasLaunchPrice(before), true);
    assert.equal(monthlyPriceFor(PLANS.STUDIO, before), 10);
    // Still the launch price long after the offer closed for new signups.
    assert.equal(monthlyPriceFor(PLANS.STUDIO_PRO, before), 13);
  });

  it("charges the regular price to a studio that joined after the offer", () => {
    assert.equal(hasLaunchPrice(after), false);
    assert.equal(monthlyPriceFor(PLANS.STARTER, after), 10);
    assert.equal(currentPriceEur(PLANS.STUDIO, after), 20);
  });

  it("counts each studio's revenue at what it actually pays", () => {
    const stats = computeBusinessStats(
      {
        studios: [
          { id: "early", createdAt: before },
          { id: "late", createdAt: after },
        ],
        subscriptions: [
          { studioId: "early", planCode: "STUDIO", status: "ACTIVE" },
          { studioId: "late", planCode: "STUDIO", status: "ACTIVE" },
        ],
        projects: [],
        photoDays: [],
        albums: [],
        reviews: [],
        picks: [],
        exports: [],
      } as never,
      after,
    );
    assert.equal(stats.revenue.mrrEur, 10 + 20);
  });
});
