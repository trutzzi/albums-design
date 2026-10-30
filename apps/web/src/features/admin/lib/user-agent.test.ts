import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserLabel, firstLanguage } from "./user-agent";

describe("browserLabel", () => {
  it("names the browser and system of a real visitor", () => {
    assert.equal(
      browserLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
      ),
      "Chrome · Windows",
    );
    assert.equal(
      browserLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1",
      ),
      "Safari · iOS",
    );
    assert.equal(
      browserLabel("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"),
      "Firefox · Linux",
    );
    assert.equal(browserLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36 Edg/141.0"), "Edge · Windows");
  });

  it("names scripts plainly, and says when nothing was sent", () => {
    assert.equal(browserLabel("curl/8.4.0"), "curl");
    assert.equal(browserLabel("python-requests/2.32"), "Python");
    assert.equal(browserLabel("Mozilla/5.0 HeadlessChrome/120.0"), "Headless Chrome");
    assert.equal(browserLabel(null), "No browser named");
    assert.equal(browserLabel("Something"), "Other browser");
  });
});

describe("firstLanguage", () => {
  it("reads the preferred language", () => {
    assert.equal(firstLanguage("ro-RO,ro;q=0.9,en;q=0.8"), "ro-RO");
    assert.equal(firstLanguage(null), null);
    assert.equal(firstLanguage(""), null);
  });
});
