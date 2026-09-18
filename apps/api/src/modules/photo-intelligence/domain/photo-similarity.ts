/**
 * Groups photos taken in the same setting: close color histograms (same
 * walls, foliage, lighting) shot within a short time window of each other
 * (same moment of the day). Either signal alone gives false positives — two
 * photos from different venues can share a histogram by coincidence, and two
 * photos seconds apart can look nothing alike (a portrait vs. the confetti
 * behind it) — so both must agree, except when a photo has no capture time
 * at all (EXIF stripped), where histogram similarity alone still counts
 * rather than silently excluding that photo from every group.
 */

export interface SimilarityCandidate {
  photoId: string;
  histogram: number[] | undefined;
  capturedAt: Date | undefined;
}

const HISTOGRAM_DISTANCE_THRESHOLD = 0.35;
const TIME_WINDOW_MS = 15 * 60 * 1000;

/** L1 (histogram-intersection) distance between two equal-length, unit-sum histograms: 0 = identical, up to 2 = disjoint. */
export function histogramDistance(a: number[], b: number[]): number {
  let sum = 0;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return sum;
}

function areSimilar(a: SimilarityCandidate, b: SimilarityCandidate): boolean {
  if (!a.histogram || !b.histogram) return false;
  if (histogramDistance(a.histogram, b.histogram) > HISTOGRAM_DISTANCE_THRESHOLD) return false;

  if (a.capturedAt && b.capturedAt) {
    return Math.abs(a.capturedAt.getTime() - b.capturedAt.getTime()) <= TIME_WINDOW_MS;
  }
  // No capture time on one or both sides — fall back to histogram alone.
  return true;
}

/**
 * Union-find over every pair, O(n²) — entirely fine at shoot scale (hundreds,
 * not millions, of photos). Returns a 1-based group number per photo id,
 * ordered so the largest groups (the most repeated settings) come first;
 * every photo gets a group, including singletons with nothing similar to.
 */
export function groupBySimilarity(candidates: SimilarityCandidate[]): Map<string, number> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let current = id;
    while (parent.get(current) !== root) {
      const next = parent.get(current) ?? root;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  for (const candidate of candidates) parent.set(candidate.photoId, candidate.photoId);

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (areSimilar(a, b)) union(a.photoId, b.photoId);
    }
  }

  const membersByRoot = new Map<string, string[]>();
  for (const candidate of candidates) {
    const root = find(candidate.photoId);
    const members = membersByRoot.get(root) ?? [];
    members.push(candidate.photoId);
    membersByRoot.set(root, members);
  }

  const orderedRoots = [...membersByRoot.entries()].sort((a, b) => b[1].length - a[1].length);

  const groupByPhotoId = new Map<string, number>();
  orderedRoots.forEach(([, members], index) => {
    for (const photoId of members) groupByPhotoId.set(photoId, index + 1);
  });
  return groupByPhotoId;
}
