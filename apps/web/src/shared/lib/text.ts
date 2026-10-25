/**
 * The first character as a reader sees it — a whole emoji or accented letter, not half of one —
 * or "" for a blank string. For initials in avatars.
 */
export function firstGrapheme(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const [first] = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed);
  return first?.segment ?? "";
}
