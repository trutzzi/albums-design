import type { Language } from "./translations";

/** The locale numbers and dates are formatted in, for the app's language. */
export function localeOf(language: Language): string {
  return language === "ro" ? "ro-RO" : "en-GB";
}

/**
 * Which form of a counted phrase to use: `.one` for 1, `.other` otherwise — and Romanian's
 * `.many` from twenty up ("20 de fotografii"), where a plain plural reads wrong.
 */
export function countKey(base: string, count: number, language: Language): string {
  if (count === 1) return `${base}.one`;
  const lastTwo = count % 100;
  return language === "ro" && (lastTwo === 0 || lastTwo >= 20) ? `${base}.many` : `${base}.other`;
}

/** "24 November" — the day a link ends, in the app's language. */
export function formatDayMonth(iso: string, language: Language): string {
  return new Date(iso).toLocaleDateString(localeOf(language), { day: "numeric", month: "long" });
}

/** "14 September 2026" — a shoot's date, with the year so an older shoot is never ambiguous. */
export function formatFullDate(iso: string, language: Language): string {
  return new Date(iso).toLocaleDateString(localeOf(language), { day: "numeric", month: "long", year: "numeric" });
}
