import { en } from "./en";
import { ro } from "./ro";

export type Language = "en" | "ro";

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ro", label: "Română" },
];

/**
 * One flat dictionary per language, English is the source of truth for which
 * keys exist. `t()` falls back to English, then to the key itself, if a
 * translation is ever missing — so a forgotten Romanian string degrades to
 * readable English rather than a blank UI.
 *
 * New features add their strings to BOTH en.ts and ro.ts, never inline text in a
 * component.
 */
export const TRANSLATIONS: Record<Language, Record<string, string>> = { en, ro };

/**
 * The actual lookup-and-interpolate logic, pulled out of the React context
 * so it can be unit tested without rendering anything: falls back to
 * English, then to the key itself, and replaces `{name}`-style placeholders.
 */
export function translate(language: Language, key: string, vars?: Record<string, string | number>): string {
  const dictionary = TRANSLATIONS[language];
  const template = dictionary[key] ?? TRANSLATIONS.en[key] ?? key;
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
}
