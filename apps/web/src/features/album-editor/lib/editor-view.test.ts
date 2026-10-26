import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEditorView } from "./editor-view";

describe("the editor view", () => {
  it("opens in the scroll view unless focus was chosen", () => {
    assert.equal(parseEditorView("focus"), "focus");
    assert.equal(parseEditorView("scroll"), "scroll");
    assert.equal(parseEditorView(null), "scroll");
    assert.equal(parseEditorView("{garbage"), "scroll");
  });
});
