import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countKey, localeOf } from "./locale";

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
