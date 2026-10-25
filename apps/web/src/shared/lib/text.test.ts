import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstGrapheme } from "./text";

describe("firstGrapheme", () => {
  it("keeps a whole emoji or accented letter, and is empty for a blank name", () => {
    assert.equal(firstGrapheme("Lumina"), "L");
    assert.equal(firstGrapheme("  Ștefan"), "Ș");
    assert.equal(firstGrapheme("📷 Studio"), "📷");
    assert.equal(firstGrapheme("   "), "");
  });
});
