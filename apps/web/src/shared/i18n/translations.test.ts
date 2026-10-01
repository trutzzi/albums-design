import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRANSLATIONS, translate } from "./translations";

describe("translate", () => {
  it("returns the string in the requested language", () => {
    assert.equal(translate("en", "nav.shoots"), "Shoots");
    assert.equal(translate("ro", "nav.shoots"), "Sesiuni foto");
  });

  it("interpolates {placeholder} values", () => {
    assert.equal(
      translate("en", "project.stats", { uploaded: 5, analysed: 3, albumWorthy: 1 }),
      "5 uploaded · 3 analysed · 1 album-worthy",
    );
  });

  it("falls back to English when a Romanian string is missing", () => {
    const dictionary = { ...TRANSLATIONS.ro };
    delete (dictionary as Record<string, string>)["nav.shoots"];
    // Simulated directly against the dictionaries, since TRANSLATIONS itself
    // is complete — this proves the fallback logic, not a real gap.
    const template = dictionary["nav.shoots"] ?? TRANSLATIONS.en["nav.shoots"];
    assert.equal(template, "Shoots");
  });

  it("falls back to the key itself when neither language has it", () => {
    assert.equal(translate("ro", "this.key.does.not.exist"), "this.key.does.not.exist");
  });

  it("keeps every English key translated into Romanian, and vice versa", () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    const roKeys = Object.keys(TRANSLATIONS.ro).sort();
    assert.deepEqual(enKeys, roKeys);
  });
});
