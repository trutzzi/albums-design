import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countKey, formatDayMonth, formatFullDate, localeOf } from "./locale";

describe("countKey", () => {
  it("picks one, other, and Romanian's form from twenty up", () => {
    assert.equal(countKey("x", 1, "en"), "x.one");
    assert.equal(countKey("x", 2, "en"), "x.other");
    assert.equal(countKey("x", 20, "en"), "x.other");
    assert.equal(countKey("x", 19, "ro"), "x.other");
    assert.equal(countKey("x", 20, "ro"), "x.many");
    assert.equal(countKey("x", 101, "ro"), "x.other");
    assert.equal(countKey("x", 0, "ro"), "x.many");
  });
});

describe("localeOf", () => {
  it("formats in the app's language", () => {
    assert.equal(localeOf("ro"), "ro-RO");
    assert.equal(localeOf("en"), "en-GB");
  });
});

describe("formatDayMonth", () => {
  it("gives the day and month in the app's language", () => {
    assert.equal(formatDayMonth("2026-11-24T10:00:00Z", "en"), "24 November");
    assert.equal(formatDayMonth("2026-11-24T10:00:00Z", "ro"), "24 noiembrie");
  });
});

describe("formatFullDate", () => {
  it("adds the year, in the app's language", () => {
    assert.equal(formatFullDate("2025-09-14T10:00:00Z", "en"), "14 September 2025");
    assert.equal(formatFullDate("2025-09-14T10:00:00Z", "ro"), "14 septembrie 2025");
    // Stored as UTC midnight: the same day wherever the photographer is.
    assert.equal(formatFullDate("2025-09-14T00:00:00.000Z", "en"), "14 September 2025");
  });
});
