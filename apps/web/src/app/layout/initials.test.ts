import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letters of the first and last name", () => {
    assert.equal(initials("Valentin Truta"), "VT");
    assert.equal(initials("  ana maria  popescu "), "AP");
  });

  it("copes with one name, none, and letters outside ASCII", () => {
    assert.equal(initials("Ștefan"), "Ș");
    assert.equal(initials("   "), "?");
  });
});
