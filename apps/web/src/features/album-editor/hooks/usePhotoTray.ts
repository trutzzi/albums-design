import { useCallback, useMemo, useState } from "react";
import type { PhotoAnalysisDTO, PhotoDTO } from "@albumflow/contracts";
import { loadTrayPrefs, saveTrayPrefs, type TrayPrefs } from "@/features/album-editor/lib/tray-prefs";
import {
  countTrayPhotos,
  filterTrayPhotos,
  isFiltering,
  type TrayContext,
  type TrayShow,
} from "@/features/album-editor/lib/tray-filter";

export type TraySort = "score" | "category" | "filename" | "similarity";

/**
 * The editor's photo tray: the shoot's photos sorted and filtered, with the counts its
 * chips show. The filters combine, so "client picks" + "portrait" narrows to both.
 */
export function usePhotoTray(options: {
  photos: PhotoDTO[] | undefined;
  analyses: PhotoAnalysisDTO[] | undefined;
  analysisByPhoto: Map<string, PhotoAnalysisDTO>;
  clientPickedIds: Set<string>;
  usedPhotoIds: Set<string>;
}) {
  const { photos, analyses, analysisByPhoto, clientPickedIds, usedPhotoIds } = options;
  const [sort, setSort] = useState<TraySort>("score");
  const [show, setShow] = useState<TrayShow>("all");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  // How big the thumbnails are and how wide the sidebar is — remembered between visits.
  const [prefs, setPrefs] = useState<TrayPrefs>(loadTrayPrefs);
  const updatePrefs = (patch: Partial<TrayPrefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      saveTrayPrefs(next);
      return next;
    });

  // The order the system ranked each photo when scoring the shoot: best
  // overall score first. Shown in the tray, and also what the tray is sorted
  // by, so a photographer sees the generator's best picks first.
  const rankByPhoto = useMemo(() => {
    const ranked = [...(analyses ?? [])].sort((a, b) => b.overall - a.overall);
    return new Map(ranked.map((analysis, index) => [analysis.photoId, index + 1]));
  }, [analyses]);

  const all = useMemo(() => {
    const withThumbnails = (photos ?? []).filter((photo) => photo.thumbnailUrl ?? photo.previewUrl);
    // Every mode is a stable sort: whatever the chosen key doesn't decide
    // (no analysis yet, a tie), the photo keeps its original order rather
    // than jumping around unpredictably.
    return [...withThumbnails].sort((a, b) => {
      switch (sort) {
        case "filename":
          return a.fileName.localeCompare(b.fileName);
        case "category": {
          const categoryA = analysisByPhoto.get(a.id)?.category ?? "";
          const categoryB = analysisByPhoto.get(b.id)?.category ?? "";
          return categoryA.localeCompare(categoryB) || a.fileName.localeCompare(b.fileName);
        }
        case "similarity": {
          const groupA = analysisByPhoto.get(a.id)?.similarityGroup ?? Infinity;
          const groupB = analysisByPhoto.get(b.id)?.similarityGroup ?? Infinity;
          return groupA - groupB || (rankByPhoto.get(a.id) ?? Infinity) - (rankByPhoto.get(b.id) ?? Infinity);
        }
        case "score":
        default:
          return (rankByPhoto.get(a.id) ?? Infinity) - (rankByPhoto.get(b.id) ?? Infinity);
      }
    });
  }, [photos, rankByPhoto, analysisByPhoto, sort]);

  // Categories that actually occur in this shoot, so the menu never offers an empty choice.
  const categories = useMemo(
    () => [...new Set((analyses ?? []).map((analysis) => analysis.category))].sort(),
    [analyses],
  );
  const context = useMemo<TrayContext>(
    () => ({
      clientPickedIds,
      usedPhotoIds,
      categoryOf: (id) => analysisByPhoto.get(id)?.category,
      isAlbumWorthy: (id) => analysisByPhoto.get(id)?.albumWorthy === true,
    }),
    [clientPickedIds, usedPhotoIds, analysisByPhoto],
  );
  const filter = useMemo(() => ({ show, category, search }), [show, category, search]);
  const counts = useMemo(() => countTrayPhotos(all, context), [all, context]);
  const visible = useMemo(() => filterTrayPhotos(all, filter, context), [all, filter, context]);

  /** Back to every photo; `showOnly` narrows straight to one chip instead. Stable, for memoised callers. */
  const clearFilters = useCallback((showOnly: TrayShow = "all") => {
    setShow(showOnly);
    setCategory("");
    setSearch("");
  }, []);

  return {
    sort,
    setSort,
    show,
    setShow,
    category,
    setCategory,
    search,
    setSearch,
    prefs,
    updatePrefs,
    rankByPhoto,
    all,
    visible,
    counts,
    categories,
    filtering: isFiltering(filter),
    clearFilters,
  };
}

export type PhotoTrayState = ReturnType<typeof usePhotoTray>;
