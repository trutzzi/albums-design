const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/**
 * "2 hours ago", "yesterday", "5 days ago" — in the reader's language. Older than a month it
 * gives the date, which reads better than "34 days ago". Under a minute it says "now".
 */
export function relativeTime(iso: string, now: Date, locale: string): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed > 30 * UNITS[0]![1]) {
    return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  }
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) return format.format(-Math.round(elapsed / size), unit);
  }
  return format.format(0, "second");
}
