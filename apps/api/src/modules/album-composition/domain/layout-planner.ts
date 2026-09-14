import {
  LAYOUT_TEMPLATES,
  findTemplate,
  templatesWithSlotCount,
  type LayoutTemplate,
  type SlotOrientation,
} from "./layout-template";
import { FULL_CROP, type Spread } from "./album";

/**
 * The planner's own view of a photo. Photo Intelligence owns the real analysis model;
 * this is the translated shape, so the two contexts stay decoupled.
 */
export interface CandidatePhoto {
  photoId: string;
  score: number;
  category: string;
  orientation: "LANDSCAPE" | "PORTRAIT" | "SQUARE";
  capturedAt: number;
}

export interface PlanOptions {
  /** Roughly how many spreads the photographer wants. Omit to size from the selection. */
  targetSpreads?: number | undefined;
  minScore?: number;
  /** Frames shot within this window are treated as the same moment. */
  burstWindowMs?: number;
  heroScore?: number;
}

const DEFAULTS = {
  minScore: 55,
  burstWindowMs: 8000,
  heroScore: 85,
  chapterGapMs: 20 * 60 * 1000,
  photosPerSpread: 3,
};

export interface Chapter {
  category: string;
  photos: CandidatePhoto[];
}

export function planAlbum(candidates: CandidatePhoto[], options: PlanOptions = {}): Spread[] {
  const minScore = options.minScore ?? DEFAULTS.minScore;
  const burstWindow = options.burstWindowMs ?? DEFAULTS.burstWindowMs;
  const heroScore = options.heroScore ?? DEFAULTS.heroScore;

  const eligible = candidates
    .filter((photo) => photo.score >= minScore)
    .sort((a, b) => a.capturedAt - b.capturedAt);

  if (eligible.length === 0) return [];

  const chapters = groupIntoChapters(eligible);
  const targetSpreads =
    options.targetSpreads ?? Math.max(1, Math.round(eligible.length / DEFAULTS.photosPerSpread));
  const targetPhotos = Math.max(1, targetSpreads * DEFAULTS.photosPerSpread);

  const selected = selectAcrossChapters(chapters, targetPhotos, burstWindow);
  return composeSpreads(selected, options.targetSpreads, heroScore);
}

/**
 * A wedding reads as a sequence of scenes. Contiguous runs of the same category
 * become one chapter; a long pause starts a new one even within a category.
 */
export function groupIntoChapters(
  photos: CandidatePhoto[],
  gapMs: number = DEFAULTS.chapterGapMs,
): Chapter[] {
  const chapters: Chapter[] = [];
  for (const photo of photos) {
    const current = chapters[chapters.length - 1];
    const previous = current?.photos[current.photos.length - 1];
    const continues =
      current !== undefined &&
      current.category === photo.category &&
      previous !== undefined &&
      photo.capturedAt - previous.capturedAt <= gapMs;

    if (continues && current) current.photos.push(photo);
    else chapters.push({ category: photo.category, photos: [photo] });
  }
  return mergeTinyChapters(chapters);
}

function mergeTinyChapters(chapters: Chapter[]): Chapter[] {
  if (chapters.length <= 1) return chapters;
  const merged: Chapter[] = [];
  for (const chapter of chapters) {
    const previous = merged[merged.length - 1];
    if (chapter.photos.length === 1 && previous) previous.photos.push(...chapter.photos);
    else merged.push({ category: chapter.category, photos: [...chapter.photos] });
  }
  return merged;
}

function selectAcrossChapters(
  chapters: Chapter[],
  targetPhotos: number,
  burstWindow: number,
): CandidatePhoto[] {
  const totalAvailable = chapters.reduce((sum, chapter) => sum + chapter.photos.length, 0);
  const picked: CandidatePhoto[] = [];

  for (const chapter of chapters) {
    const share = Math.max(
      1,
      Math.round((chapter.photos.length / totalAvailable) * targetPhotos),
    );
    picked.push(...selectFromChapter(chapter.photos, share, burstWindow));
  }

  return picked.sort((a, b) => a.capturedAt - b.capturedAt);
}

/**
 * Greedy best-first with a burst guard: taking the five best frames of one moment
 * would produce a page of near-duplicates, which is what photographers hate most
 * about automated selection.
 */
export function selectFromChapter(
  photos: CandidatePhoto[],
  quota: number,
  burstWindow: number,
): CandidatePhoto[] {
  const byScore = [...photos].sort((a, b) => b.score - a.score);
  const chosen: CandidatePhoto[] = [];

  for (const photo of byScore) {
    if (chosen.length >= quota) break;
    const clashes = chosen.some(
      (existing) => Math.abs(existing.capturedAt - photo.capturedAt) < burstWindow,
    );
    if (!clashes) chosen.push(photo);
  }

  // If the burst guard starved the quota, backfill with the next best frames.
  for (const photo of byScore) {
    if (chosen.length >= quota) break;
    if (!chosen.includes(photo)) chosen.push(photo);
  }

  return chosen;
}

/**
 * Album design is rhythm, not repetition. A greedy best-fit picks the same winning
 * template for every similar run of photos, which is how you end up with twenty
 * identical spreads. Three things break that up here: the spread size is driven
 * toward the requested page count, a standout frame earns a page of its own, and a
 * template that ran recently is penalised so the next-best one gets a turn.
 */
function composeSpreads(
  photos: CandidatePhoto[],
  targetSpreads: number | undefined,
  heroScore: number,
): Spread[] {
  const spreads: Spread[] = [];
  const recent: string[] = [];
  let index = 0;

  while (index < photos.length) {
    const lead = photos[index];
    if (!lead) break;

    const remainingPhotos = photos.length - index;
    const remainingSpreads = targetSpreads
      ? Math.max(1, targetSpreads - spreads.length)
      : Math.max(1, Math.round(remainingPhotos / DEFAULTS.photosPerSpread));

    if (deservesWholeSpread(lead, photos, index, heroScore, spreads.length === 0)) {
      const hero = findTemplate(lead.orientation === "PORTRAIT" ? "single-centred" : "hero-full-bleed");
      if (hero) {
        spreads.push(toSpread(hero, [lead]));
        remember(recent, hero.id);
        index += 1;
        continue;
      }
    }

    // Aim at the requested page count rather than taking whatever fits best.
    const ideal = clamp(Math.round(remainingPhotos / remainingSpreads), 1, MAX_SLOTS_PER_SPREAD);
    const group = photos.slice(index, index + ideal);
    const chosen = chooseTemplate(group, recent);

    spreads.push(toSpread(chosen.template, group.slice(0, chosen.take), chosen.assignment));
    remember(recent, chosen.template.id);
    index += chosen.take;
  }

  return spreads;
}

/** The largest spread the catalogue can lay out — a contact-sheet grid. */
export const MAX_SLOTS_PER_SPREAD = 9;
const RECENT_MEMORY = 4;

/** Penalties by how many spreads ago the template last appeared. */
const REPETITION_PENALTY = [1.1, 0.55, 0.28, 0.12];

function remember(recent: string[], templateId: string): void {
  recent.unshift(templateId);
  if (recent.length > RECENT_MEMORY) recent.pop();
}

/**
 * A frame is worth a whole spread when it opens the album, or when it is clearly
 * stronger than the frames around it — not merely because it crossed a threshold.
 */
function deservesWholeSpread(
  lead: CandidatePhoto,
  photos: CandidatePhoto[],
  index: number,
  heroScore: number,
  opensAlbum: boolean,
): boolean {
  if (opensAlbum) return true;
  if (lead.score < heroScore) return false;
  const neighbours = photos.slice(index + 1, index + 4);
  if (neighbours.length === 0) return false;
  const best = Math.max(...neighbours.map((photo) => photo.score));
  return lead.score - best >= 6;
}

export interface TemplateChoice {
  template: LayoutTemplate;
  take: number;
  /** Photo index per slot, so the strongest frame lands in the largest slot. */
  assignment: number[];
}

/**
 * Scores a template against a run of photos on three axes: how well slot
 * orientations match the frames, whether the template's size hierarchy mirrors the
 * spread in photo quality, and whether it would repeat what just came before.
 */
export function chooseTemplate(group: CandidatePhoto[], recent: string[] = []): TemplateChoice {
  const ranked = rankTemplates(group, { recent });
  const best = ranked[0];
  if (best) return { template: best.template, take: best.take, assignment: best.assignment };
  const fallback = (findTemplate("single-centred") ?? LAYOUT_TEMPLATES[0]) as LayoutTemplate;
  return { template: fallback, take: 1, assignment: [0] };
}

export interface RankedTemplate extends TemplateChoice {
  score: number;
}

/**
 * Every layout that could hold this run of photos, best fit first. The planner takes
 * the top entry; the editor offers the whole list so a photographer can shuffle
 * through the alternatives the algorithm also considered.
 */
export function rankTemplates(
  group: CandidatePhoto[],
  options: { recent?: string[]; exactSlots?: number } = {},
): RankedTemplate[] {
  const recent = options.recent ?? [];
  const explicitChoice = options.exactSlots !== undefined;
  const sizes = explicitChoice ? [options.exactSlots as number] : candidateSizes(group.length);
  const ranked: RankedTemplate[] = [];

  for (const take of sizes) {
    const slice = group.slice(0, take);
    if (slice.length < take) continue;
    for (const template of templatesWithSlotCount(take)) {
      // Automatic planning decides full-bleed separately, by photo strength. When the
      // photographer picks the photos themselves it belongs in the options.
      if (template.fullBleed && !explicitChoice) continue;
      const evaluated = evaluateTemplate(template, slice, recent);
      ranked.push({
        template,
        take,
        assignment: evaluated.assignment,
        score: evaluated.score,
      });
    }
  }

  return ranked.sort((a, b) => b.score - a.score);
}

/** Prefer the requested size, but let one photo either side compete. */
function candidateSizes(available: number): number[] {
  const sizes = new Set<number>();
  for (const delta of [0, -1, 1]) {
    const size = available + delta;
    if (size >= 1 && size <= Math.min(available, MAX_SLOTS_PER_SPREAD)) sizes.add(size);
  }
  return [...sizes];
}

function evaluateTemplate(
  template: LayoutTemplate,
  photos: CandidatePhoto[],
  recent: string[],
): { score: number; assignment: number[] } {
  const assignment = assignByProminence(template, photos);

  let affinity = 0;
  template.slots.forEach((slot, slotIndex) => {
    const photo = photos[assignment[slotIndex] ?? 0];
    if (photo) affinity += orientationAffinity(slot.prefers, photo.orientation);
  });
  affinity /= Math.max(1, template.slots.length);

  const penaltyIndex = recent.indexOf(template.id);
  const penalty = penaltyIndex === -1 ? 0 : (REPETITION_PENALTY[penaltyIndex] ?? 0);

  return {
    assignment,
    score: affinity + hierarchyMatch(template, photos) * 0.6 - penalty,
  };
}

/**
 * A template with one dominant slot suits a run containing one standout; an even
 * grid suits frames of equal merit. Matching those two spreads is what makes the
 * layout feel considered rather than arbitrary.
 */
function hierarchyMatch(template: LayoutTemplate, photos: CandidatePhoto[]): number {
  const areas = template.slots.map((slot) => slot.width * slot.height);
  const scores = photos.map((photo) => photo.score);
  if (areas.length < 2 || scores.length < 2) return 0.5;
  return 1 - Math.abs(spread(areas) - spread(scores));
}

function spread(values: number[]): number {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max <= 0 ? 0 : (max - min) / max;
}

/** Largest slot gets the best frame, and so on down. */
function assignByProminence(template: LayoutTemplate, photos: CandidatePhoto[]): number[] {
  const slotOrder = template.slots
    .map((slot, index) => ({ index, area: slot.width * slot.height }))
    .sort((a, b) => b.area - a.area);
  const photoOrder = photos
    .map((photo, index) => ({ index, score: photo.score }))
    .sort((a, b) => b.score - a.score);

  const assignment = new Array<number>(template.slots.length).fill(0);
  slotOrder.forEach((slot, rank) => {
    assignment[slot.index] = photoOrder[rank]?.index ?? photoOrder[photoOrder.length - 1]?.index ?? 0;
  });
  return assignment;
}

function orientationAffinity(prefers: SlotOrientation, actual: string): number {
  if (prefers === "ANY") return 0.5;
  if (prefers === actual) return 1;
  if (prefers === "SQUARE" || actual === "SQUARE") return 0.3;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toSpread(
  template: LayoutTemplate,
  photos: CandidatePhoto[],
  assignment?: number[],
): Spread {
  return {
    templateId: template.id,
    placements: template.slots.map((slot, index) => {
      const photoIndex = assignment?.[index] ?? index;
      const photo = photos[photoIndex] ?? photos[photos.length - 1];
      return {
        slotId: slot.id,
        photoId: photo?.photoId ?? "",
        crop: { ...FULL_CROP },
        treatment: "COLOR" as const,
      };
    }),
  };
}
