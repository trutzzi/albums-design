import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("deploy hygiene", () => {
  // A VITE_ variable is compiled into a public bundle, and a studio API key opens that
  // studio's every shoot — one stray reference would hand it to each visitor.
  it("never hands the web build a studio API key", () => {
    assert.doesNotMatch(ci, /VITE_STUDIO_API_KEY/);
  });

  it("never reads a studio API key in the web app", () => {
    for (const file of sourceFiles(join(ROOT, "apps/web/src"))) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /STUDIO_API_KEY/, file);
    }
  });

  it("uploads the web app over an encrypted connection", () => {
    const upload = ci.slice(ci.indexOf("FTP-Deploy-Action"));
    assert.match(upload, /protocol: ftps\b/);
  });
});
