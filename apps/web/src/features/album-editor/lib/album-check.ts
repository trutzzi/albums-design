import {
  focusedBaseCrop,
  isUntouchedCrop,
  spacedSlotRect,
  type AlbumDTO,
  type LayoutTemplateDTO,
  type NormalisedRect,
  type PhotoAnalysisDTO,
} from "@albumflow/contracts";

/**
 * Everything worth a second look before the album goes to the client or the lab —
 * computed in the browser from what the editor already has, so it is instant and
 * always matches the screen.
 */
export type AlbumIssue =
  | {
      kind: "lowResolution";
      severity: "error" | "warning";
      spreadIndex: number;
      slotId: string;
      photoId: string;
      dpi: number;
    }
  | { kind: "emptySlot"; severity: "error"; spreadIndex: number; slotId: string }
  | {
      kind: "usedTwice";
      severity: "warning";
      spreadIndex: number;
      slotId: string;
      photoId: string;
      otherSpreadIndex: number;
    }
  | {
      kind: "nearDuplicate";
      severity: "warning";
      spreadIndex: number;
      slotId: string;
      photoId: string;
      otherSpreadIndex: number;
    }
  | { kind: "faceOnFold"; severity: "warning"; spreadIndex: number; slotId: string; photoId: string }
  | { kind: "unusedBest"; severity: "info"; photoIds: string[] };

/** Below this a print looks soft; below the error line it looks visibly pixelated. */
export const DPI_WARNING = 200;
export const DPI_ERROR = 150;
/** Frames taken this close together are a burst: the same moment, twice. */
const BURST_MS = 4000;
/** How close to the fold a subject has to be before the binding swallows it. */
const FOLD_MARGIN = 0.035;
/** How many of the shoot's best photos are expected somewhere in the album. */
const BEST_COUNT = 12;

export interface CheckInput {
  album: Pick<AlbumDTO, "spreads" | "format" | "style" | "cover">;
  templates: ReadonlyMap<string, LayoutTemplateDTO>;
  analyses: ReadonlyMap<string, PhotoAnalysisDTO>;
  /** Photos that still exist in the shoot; a placement pointing elsewhere is empty. */
  existingPhotoIds: ReadonlySet<string>;
}

export function checkAlbum({ album, templates, analyses, existingPhotoIds }: CheckInput): AlbumIssue[] {
  const issues: AlbumIssue[] = [];
  const spreadWidthMm = album.format.pageWidthMm * 2;
  const spreadHeightMm = album.format.pageHeightMm;
  const firstUse = new Map<string, number>();
  const placed: { spreadIndex: number; slotId: string; photoId: string }[] = [];

  album.spreads.forEach((spread, spreadIndex) => {
    const template = templates.get(spread.templateId);
    for (const placement of spread.placements) {
      const slot = template?.slots.find((candidate) => candidate.id === placement.slotId);
      if (!slot || !template) continue;
      if (!placement.photoId || !existingPhotoIds.has(placement.photoId)) {
        issues.push({ kind: "emptySlot", severity: "error", spreadIndex, slotId: placement.slotId });
        continue;
      }

      const seenOn = firstUse.get(placement.photoId);
      if (seenOn !== undefined) {
        issues.push({
          kind: "usedTwice",
          severity: "warning",
          spreadIndex,
          slotId: placement.slotId,
          photoId: placement.photoId,
          otherSpreadIndex: seenOn,
        });
      } else {
        firstUse.set(placement.photoId, spreadIndex);
      }
      placed.push({ spreadIndex, slotId: placement.slotId, photoId: placement.photoId });

      const analysis = analyses.get(placement.photoId);
      if (!analysis || !analysis.width || !analysis.height) continue;
      const rect = placement.frame ?? spacedSlotRect(slot, template, album.style.spacing);
      const crop = effectiveCrop(placement.crop, analysis, rect, spreadWidthMm / spreadHeightMm);

      const dpi = printResolution(crop, analysis, rect, spreadWidthMm, spreadHeightMm);
      if (dpi < DPI_WARNING) {
        issues.push({
          kind: "lowResolution",
          severity: dpi < DPI_ERROR ? "error" : "warning",
          spreadIndex,
          slotId: placement.slotId,
          photoId: placement.photoId,
          dpi: Math.round(dpi),
        });
      }

      if (analysis.faceCount > 0 && analysis.focus && rect.x < 0.5 && rect.x + rect.width > 0.5) {
        const onSpread = rect.x + ((analysis.focus.x - crop.x) / crop.width) * rect.width;
        if (Math.abs(onSpread - 0.5) < FOLD_MARGIN) {
          issues.push({
            kind: "faceOnFold",
            severity: "warning",
            spreadIndex,
            slotId: placement.slotId,
            photoId: placement.photoId,
          });
        }
      }
    }
  });

  // The same moment twice, close enough in the album for the client to notice.
  const flagged = new Set<string>();
  for (const a of placed) {
    for (const b of placed) {
      if (a === b || a.photoId === b.photoId || Math.abs(a.spreadIndex - b.spreadIndex) > 1) continue;
      if (b.spreadIndex < a.spreadIndex || (b.spreadIndex === a.spreadIndex && b.slotId <= a.slotId)) continue;
      const first = analyses.get(a.photoId);
      const second = analyses.get(b.photoId);
      if (!first?.capturedAt || !second?.capturedAt || first.similarityGroup !== second.similarityGroup) continue;
      if (Math.abs(Date.parse(first.capturedAt) - Date.parse(second.capturedAt)) > BURST_MS) continue;
      const key = `${b.spreadIndex}:${b.slotId}`;
      if (flagged.has(key)) continue;
      flagged.add(key);
      issues.push({
        kind: "nearDuplicate",
        severity: "warning",
        spreadIndex: b.spreadIndex,
        slotId: b.slotId,
        photoId: b.photoId,
        otherSpreadIndex: a.spreadIndex,
      });
    }
  }

  const used = new Set([...firstUse.keys(), ...(album.cover?.photoId ? [album.cover.photoId] : [])]);
  const best = [...analyses.values()]
    .filter((analysis) => analysis.albumWorthy && existingPhotoIds.has(analysis.photoId))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, BEST_COUNT)
    .filter((analysis) => !used.has(analysis.photoId))
    .map((analysis) => analysis.photoId);
  if (best.length > 0) issues.push({ kind: "unusedBest", severity: "info", photoIds: best });

  const order = { error: 0, warning: 1, info: 2 } as const;
  return issues.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      ("spreadIndex" in a ? a.spreadIndex : Infinity) - ("spreadIndex" in b ? b.spreadIndex : Infinity),
  );
}

/** The crop that will actually print: an untouched one is the subject-centred base crop. */
function effectiveCrop(
  crop: NormalisedRect,
  analysis: Pick<PhotoAnalysisDTO, "width" | "height" | "focus">,
  rect: NormalisedRect,
  spreadAspect: number,
): NormalisedRect {
  if (!isUntouchedCrop(crop)) return crop;
  return focusedBaseCrop(analysis.width / analysis.height, (rect.width * spreadAspect) / rect.height, analysis.focus);
}

/** Pixels per inch on paper along the tighter axis — what a lab's "300 dpi" refers to. */
export function printResolution(
  crop: NormalisedRect,
  analysis: Pick<PhotoAnalysisDTO, "width" | "height">,
  rect: NormalisedRect,
  spreadWidthMm: number,
  spreadHeightMm: number,
): number {
  const inchesWide = (rect.width * spreadWidthMm) / 25.4;
  const inchesHigh = (rect.height * spreadHeightMm) / 25.4;
  if (inchesWide <= 0 || inchesHigh <= 0) return Infinity;
  return Math.min((crop.width * analysis.width) / inchesWide, (crop.height * analysis.height) / inchesHigh);
}

/** Issues per spread, for the markers on the page strip. */
export function issuesBySpread(issues: readonly AlbumIssue[]): Map<number, { errors: number; warnings: number }> {
  const bySpread = new Map<number, { errors: number; warnings: number }>();
  for (const issue of issues) {
    if (!("spreadIndex" in issue)) continue;
    const entry = bySpread.get(issue.spreadIndex) ?? { errors: 0, warnings: 0 };
    if (issue.severity === "error") entry.errors += 1;
    else entry.warnings += 1;
    bySpread.set(issue.spreadIndex, entry);
  }
  return bySpread;
}
