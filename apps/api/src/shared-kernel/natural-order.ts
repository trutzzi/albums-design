/**
 * The order a person expects for file names: by the numbers inside them, not
 * character by character, so IMG_2.jpg comes before IMG_10.jpg and case does not
 * matter. Ties (the same name twice) fall back to the id, so the order is fully
 * deterministic — a list must not reshuffle between two requests.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareFileNames(a: { fileName: string; id: string }, b: { fileName: string; id: string }): number {
  return collator.compare(a.fileName, b.fileName) || a.id.localeCompare(b.id);
}
