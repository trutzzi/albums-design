import type { PhotoAnalysisDTO } from "@albumflow/contracts";

/** Categories that tell the story; details, venue and candids belong to whatever is happening around them. */
const NARRATIVE: Record<string, string> = {
  PREPARATION: "preparation",
  CEREMONY: "ceremony",
  PORTRAIT: "portraits",
  COUPLE: "portraits",
  GROUP: "family",
  RECEPTION: "party",
};

/**
 * Where each chapter of the day begins: the chapter key for a spread that opens one,
 * `undefined` for a spread that carries on the one before. A spread's chapter is the
 * story category most of its photos belong to; spreads of only details or venue shots
 * stay in the current chapter rather than starting an anonymous one.
 */
export function chapterStarts(
  spreads: readonly { placements: readonly { photoId: string }[] }[],
  analyses: ReadonlyMap<string, Pick<PhotoAnalysisDTO, "category">>,
): (string | undefined)[] {
  let current: string | undefined;
  return spreads.map((spread) => {
    const votes = new Map<string, number>();
    for (const placement of spread.placements) {
      const chapter = NARRATIVE[analyses.get(placement.photoId)?.category ?? ""];
      if (chapter) votes.set(chapter, (votes.get(chapter) ?? 0) + 1);
    }
    let winner: string | undefined;
    for (const [chapter, count] of votes) {
      if (winner === undefined || count > (votes.get(winner) ?? 0)) winner = chapter;
    }
    if (!winner || winner === current) return undefined;
    current = winner;
    return winner;
  });
}
