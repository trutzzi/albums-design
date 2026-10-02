import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MAX_PHOTOS_PER_SPREAD, type AlbumDTO, type LayoutSuggestionDTO } from "@albumflow/contracts";
import { editAlbum, suggestSpreadLayouts } from "@/shared/api";

type Spread = AlbumDTO["spreads"][number];

/** The same photos in any order are the same set, and share one ranking of layouts. */
function photoSetKey(photoIds: string[]): string {
  return [...photoIds].sort().join("|");
}

function photoIdsOf(placements: { photoId: string }[]): string[] {
  return placements.map((placement) => placement.photoId).filter(Boolean);
}

/**
 * Edits that change which photos a spread holds, or which design lays them out: each asks
 * the server to rank the layouts that fit the new photo set and applies one of them.
 */
export function useSpreadLayouts(options: {
  albumId: string;
  projectId: string;
  album: AlbumDTO | undefined;
  /** The spread in view, whose ranking is fetched ahead of the first click. */
  currentSpread: number;
  /** Records the album an edit returned (see useAlbumDraft). */
  commit: (updated: AlbumDTO) => void;
}) {
  const { albumId, projectId, album, currentSpread, commit } = options;

  // Suggestions are keyed by the photo set, so stepping through a spread's designs never refetches.
  const suggestionCache = useRef<Map<string, LayoutSuggestionDTO[]>>(new Map());
  // Bumped when a ranking arrives, so the "Design 3 of 12" counters redraw with it.
  const [, setSuggestionsLoaded] = useState(0);

  const suggestionsFor = useCallback(
    async (photoIds: string[]): Promise<LayoutSuggestionDTO[]> => {
      const key = photoSetKey(photoIds);
      const cached = suggestionCache.current.get(key);
      if (cached) return cached;
      const fresh = await suggestSpreadLayouts(projectId, photoIds);
      suggestionCache.current.set(key, fresh);
      setSuggestionsLoaded((count) => count + 1);
      return fresh;
    },
    [projectId],
  );

  /** The best-ranked layout for a photo set, applied to one spread. */
  const fitBest = async (spreadIndex: number, photoIds: string[]) => {
    const best = (await suggestionsFor(photoIds))[0];
    if (!best) throw new Error(`No layout holds ${photoIds.length} photos.`);
    return { type: "CHANGE_TEMPLATE" as const, spreadIndex, templateId: best.templateId, photoIds: best.photoIds };
  };
  const spreadAt = (index: number): Spread => {
    const spread = album?.spreads[index];
    if (!spread) throw new Error("That spread is gone.");
    return spread;
  };

  const addAsSpread = useMutation({
    mutationFn: async (picked: string[]) => {
      const ranked = await suggestionsFor(picked);
      const best = ranked[0];
      if (!best) throw new Error("No layout fits that many photos.");
      return editAlbum(albumId, {
        type: "ADD_SPREAD",
        atIndex: album?.spreads.length ?? 0,
        templateId: best.templateId,
        photoIds: best.photoIds,
      });
    },
    onSuccess: commit,
  });

  const shuffle = useMutation({
    mutationFn: async ({ spreadIndex, step }: { spreadIndex: number; step: 1 | -1 }) => {
      const spread = spreadAt(spreadIndex);
      const ranked = await suggestionsFor(photoIdsOf(spread.placements));
      if (ranked.length < 2) throw new Error("No other layout holds this many photos.");

      // A layout outside the ranking (a hand-picked one) steps to either end of it.
      const currentIndex = ranked.findIndex((entry) => entry.templateId === spread.templateId);
      const nextIndex =
        currentIndex < 0 ? (step === 1 ? 0 : ranked.length - 1) : (currentIndex + step + ranked.length) % ranked.length;
      const next = ranked[nextIndex];
      if (!next) throw new Error("No alternative layout found.");
      return editAlbum(albumId, {
        type: "CHANGE_TEMPLATE",
        spreadIndex,
        templateId: next.templateId,
        photoIds: next.photoIds,
      });
    },
    onSuccess: commit,
  });

  // Growing a spread past its template's own slot count: no new endpoint —
  // this is exactly what "shuffle design" already does (suggest layouts for a
  // photo set, apply the best-ranked one), just for the existing photos plus
  // one more, rather than for a shuffle among templates of the same size.
  const addPhoto = useMutation({
    mutationFn: async ({ spreadIndex, photoId }: { spreadIndex: number; photoId: string }) => {
      const existing = photoIdsOf(spreadAt(spreadIndex).placements);
      if (existing.includes(photoId)) throw new Error("That photo is already on this spread.");
      const grown = [...existing, photoId];
      if (grown.length > MAX_PHOTOS_PER_SPREAD) {
        throw new Error(`A spread holds at most ${MAX_PHOTOS_PER_SPREAD} photos.`);
      }
      return editAlbum(albumId, await fitBest(spreadIndex, grown));
    },
    onSuccess: commit,
  });

  // The inverse of addPhoto: shrink instead of grow, same re-suggest step either way.
  // Refuses to go to zero — a spread with no photos has nothing for any template to
  // hold; "Remove" (the whole spread) is the right action there instead.
  const removePhoto = useMutation({
    mutationFn: async ({ spreadIndex, slotId }: { spreadIndex: number; slotId: string }) => {
      const shrunk = photoIdsOf(spreadAt(spreadIndex).placements.filter((placement) => placement.slotId !== slotId));
      if (shrunk.length === 0) {
        throw new Error("A spread needs at least one photo — remove the whole spread instead.");
      }
      return editAlbum(albumId, await fitBest(spreadIndex, shrunk));
    },
    onSuccess: commit,
  });

  // Dragging a photo across spreads and dropping it on the margins — not onto
  // another slot — moves it outright rather than trading it for whatever's
  // there: the source spread shrinks by one and re-suggests its layout, the
  // destination grows by one and does the same, exactly like removePhoto +
  // addPhoto run back to back.
  const movePhoto = useMutation({
    mutationFn: async ({
      fromSpreadIndex,
      fromSlotId,
      toSpreadIndex,
    }: {
      fromSpreadIndex: number;
      fromSlotId: string;
      toSpreadIndex: number;
    }) => {
      const fromSpread = album?.spreads[fromSpreadIndex];
      const toSpread = album?.spreads[toSpreadIndex];
      if (!fromSpread || !toSpread) throw new Error("That spread is gone.");
      const moving = fromSpread.placements.find((placement) => placement.slotId === fromSlotId);
      if (!moving?.photoId) throw new Error("There's no photo there to move.");

      const remaining = photoIdsOf(fromSpread.placements.filter((placement) => placement.slotId !== fromSlotId));
      if (remaining.length === 0) {
        throw new Error("A spread needs at least one photo — remove the whole spread instead.");
      }
      const grown = [...photoIdsOf(toSpread.placements), moving.photoId];
      if (grown.length > MAX_PHOTOS_PER_SPREAD) {
        throw new Error(`A spread holds at most ${MAX_PHOTOS_PER_SPREAD} photos.`);
      }

      // Both rankings load together; fitBest then reads them from the cache.
      await Promise.all([suggestionsFor(remaining), suggestionsFor(grown)]);
      const shrunkEdit = await fitBest(fromSpreadIndex, remaining);
      const grownEdit = await fitBest(toSpreadIndex, grown);
      // Sequential, not parallel: both edits land on the same album, and the
      // second must build on the first's persisted state, not race it.
      await editAlbum(albumId, shrunkEdit);
      return editAlbum(albumId, grownEdit);
    },
    onSuccess: commit,
  });

  const shuffleRef = useRef(shuffle.mutate);
  shuffleRef.current = shuffle.mutate;
  // One step at a time: a held arrow key must not send edits computed from a stale layout.
  const cycling = useRef(false);
  const cycleDesign = useCallback((spreadIndex: number, step: 1 | -1) => {
    if (cycling.current) return;
    cycling.current = true;
    shuffleRef.current({ spreadIndex, step }, { onSettled: () => void (cycling.current = false) });
  }, []);

  /** Where a spread's layout sits among those ranked for its photos, once that ranking is known. */
  const designPositionOf = (spread: { templateId: string; placements: { photoId: string }[] }) => {
    const ranked = suggestionCache.current.get(photoSetKey(photoIdsOf(spread.placements)));
    if (!ranked) return { index: null, total: null };
    const index = ranked.findIndex((entry) => entry.templateId === spread.templateId);
    return { index: index < 0 ? null : index, total: ranked.length };
  };

  // The spread in view gets its ranking early, so its counter reads "Design 3 of 12"
  // before the first click; the others load when someone steps through them.
  const photosInView = photoIdsOf(album?.spreads[currentSpread]?.placements ?? []);
  const photosInViewKey = photoSetKey(photosInView);
  useEffect(() => {
    if (photosInView.length === 0 || suggestionCache.current.has(photosInViewKey)) return;
    // Only a head start: if it fails, the first arrow press asks again and shows the error.
    void suggestionsFor(photosInView).catch(() => undefined);
    // Keyed by the photo set rather than the array, which is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosInViewKey, suggestionsFor]);

  return { addAsSpread, shuffle, addPhoto, removePhoto, movePhoto, cycleDesign, designPositionOf };
}
