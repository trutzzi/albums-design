import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityKey, relativeTime } from "./activity";

const now = new Date("2026-10-25T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("relativeTime", () => {
  it("speaks in minutes, hours and days, in the reader's language", () => {
    assert.equal(relativeTime(ago(10 * 60 * 1000), now, "en-GB"), "10 minutes ago");
    assert.equal(relativeTime(ago(2 * 60 * 60 * 1000), now, "en-GB"), "2 hours ago");
    assert.equal(relativeTime(ago(24 * 60 * 60 * 1000), now, "en-GB"), "yesterday");
    assert.equal(relativeTime(ago(3 * 24 * 60 * 60 * 1000), now, "ro-RO"), "acum 3 zile");
  });

  it("says now for the last minute, and gives the date past a month", () => {
    assert.equal(relativeTime(ago(20 * 1000), now, "en-GB"), "now");
    assert.equal(relativeTime("2026-08-01T12:00:00Z", now, "en-GB"), "1 Aug 2026");
  });
});

describe("activityKey", () => {
  it("uses the nameless sentence when the link names no client", () => {
    assert.equal(activityKey({ kind: "reviewApproved", name: "Elena" }), "project.activity.reviewApproved");
    assert.equal(activityKey({ kind: "reviewApproved", name: null }), "project.activity.reviewApproved.anon");
    assert.equal(activityKey({ kind: "reviewApproved", name: "  " }), "project.activity.reviewApproved.anon");
    assert.equal(activityKey({ kind: "albumCreated", name: null }), "project.activity.albumCreated");
  });
});
