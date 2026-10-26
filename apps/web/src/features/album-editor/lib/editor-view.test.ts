import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { neighboursOf, parseEditorView } from "./editor-view";

describe("the editor view", () => {
  it("opens in the scroll view unless focus was chosen", () => {
    assert.equal(parseEditorView("focus"), "focus");
    assert.equal(parseEditorView("scroll"), "scroll");
    assert.equal(parseEditorView(null), "scroll");
    assert.equal(parseEditorView("{garbage"), "scroll");
  });

  it("steps between spreads without running off either end", () => {
    assert.deepEqual(neighboursOf(0, 3), { previous: null, next: 1 });
    assert.deepEqual(neighboursOf(1, 3), { previous: 0, next: 2 });
    assert.deepEqual(neighboursOf(2, 3), { previous: 1, next: null });
    assert.deepEqual(neighboursOf(0, 1), { previous: null, next: null });
  });
});
