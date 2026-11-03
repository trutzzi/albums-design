import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatFileSize } from "./file-size";

describe("formatFileSize", () => {
  it("reads in the largest unit that makes sense", () => {
    assert.equal(formatFileSize(300, "en-GB"), "1 KB");
    assert.equal(formatFileSize(850 * 1024, "en-GB"), "850 KB");
    assert.equal(formatFileSize(24.6 * 1024 ** 2, "en-GB"), "24.6 MB");
    assert.equal(formatFileSize(1.25 * 1024 ** 3, "ro-RO"), "1,3 GB");
  });
});
