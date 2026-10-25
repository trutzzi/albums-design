import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CLIENT_STYLE, type ClientBrandingDTO } from "@albumflow/contracts";
import { fixedTheme, sectionLabel, titleFontStack, titleFontStylesheet, watermarkVariables } from "./client-style";

const branding = (overrides: Partial<ClientBrandingDTO> = {}): ClientBrandingDTO => ({
  name: 'Artzz "Foto"',
  accent: null,
  logo: null,
  website: null,
  phone: null,
  email: null,
  style: { ...DEFAULT_CLIENT_STYLE, watermark: { enabled: true, position: "center", opacity: 0.3 } },
  ...overrides,
});

describe("client page style", () => {
  it("loads only the fonts the app does not already have", () => {
    assert.equal(titleFontStylesheet("plex-serif"), null);
    assert.equal(
      titleFontStylesheet("cormorant"),
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&display=swap",
    );
    assert.match(titleFontStack("montserrat"), /^Montserrat, .*sans-serif$/);
  });

  it("fixes the theme only when the studio chose one", () => {
    assert.equal(fixedTheme(DEFAULT_CLIENT_STYLE), null);
    assert.equal(fixedTheme({ ...DEFAULT_CLIENT_STYLE, theme: "cream" }), "cream");
    assert.equal(fixedTheme(undefined), null);
  });

  it("uses the studio's section names and falls back to the translation", () => {
    const style = { ...DEFAULT_CLIENT_STYLE, sectionNames: { COUPLE: "Ședința foto", GROUP: "  " } };
    const t = (key: string) => `t:${key}`;
    assert.equal(sectionLabel("COUPLE", style, t), "Ședința foto");
    assert.equal(sectionLabel("GROUP", style, t), "t:gallery.section.GROUP");
    assert.equal(sectionLabel("CEREMONY", undefined, t), "t:gallery.section.CEREMONY");
  });

  it("watermarks with the logo when there is one, and the quoted name otherwise", () => {
    assert.deepEqual(watermarkVariables(branding({ logo: "data:image/png;base64,AAAA" })), {
      "--wm-image": 'url("data:image/png;base64,AAAA")',
      "--wm-text": '""',
      "--wm-opacity": "0.3",
    });
    assert.equal(watermarkVariables(branding())["--wm-text"], '"Artzz \\"Foto\\""');
  });
});
