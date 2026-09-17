import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  AlbumDTO,
  AlbumEditInput,
  Crop,
  LayoutSuggestionDTO,
  PhotoTreatment,
  SlotFrame,
} from "@albumflow/contracts";
import { MAX_PHOTOS_PER_SPREAD } from "@albumflow/contracts";
import {
  editAlbum,
  deleteAlbum,
  getAlbum,
  deleteExport,
  getExportDownload,
  listExports,
  listLayoutTemplates,
  listProjectAnalyses,
  listProjectPhotos,
  getAlbumFeedback,
  listReviewSessions,
  openReviewSession,
  resolveComment,
  requestExport,
  suggestSpreadLayouts,
} from "../../lib/api";
import { SpreadBlock } from "../../components/SpreadBlock";
import { PhotoTray } from "../../components/PhotoTray";
import { ClientFeedback, openCommentsBySpread } from "../../components/ClientFeedback";
import type { FeedbackComment } from "../../lib/api";

type Spread = AlbumDTO["spreads"][number];

export function AlbumEditorPage() {
  const { albumId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ spreadIndex: number; slotId: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Armed by "+ Add photo" on a spread: the next tray click grows that spread
  // instead of replacing a slot or building a new one. Mutually exclusive with
  // `selected` — engaging one clears the other, so a click is never ambiguous.
  const [addingToSpread, setAddingToSpread] = useState<number | null>(null);
  const [showRuler, setShowRuler] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [clientName, setClientName] = useState("");
  const [shareLink, setShareLink] = useState<string | null>(null);

  const album = useQuery({ queryKey: ["album", albumId], queryFn: () => getAlbum(albumId) });
  const templates = useQuery({ queryKey: ["templates"], queryFn: listLayoutTemplates });
  const projectId = album.data?.projectId ?? "";
  const photos = useQuery({
    queryKey: ["photos", projectId],
    queryFn: () => listProjectPhotos(projectId),
    enabled: projectId !== "",
  });
  const analyses = useQuery({
    queryKey: ["analyses", projectId],
    queryFn: () => listProjectAnalyses(projectId),
    enabled: projectId !== "",
  });
  const reviews = useQuery({
    queryKey: ["reviews", albumId],
    queryFn: () => listReviewSessions(albumId),
  });
  const feedback = useQuery({
    queryKey: ["feedback", albumId],
    queryFn: () => getAlbumFeedback(albumId),
    // A client may be reviewing while the photographer edits, so notes arrive
    // without a page reload.
    refetchInterval: 30000,
  });

  const exports = useQuery({
    queryKey: ["exports", albumId],
    queryFn: () => listExports(albumId),
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === "QUEUED" || job.status === "RENDERING")
        ? 3000
        : false,
  });

  // Dragging updates 60x a second; the server only needs the frame you settle on.
  const [draft, setDraft] = useState<AlbumDTO | null>(null);
  const pendingCrop = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo/redo history: every spreads snapshot the server has confirmed, so
  // stepping back or forward replays a real prior state rather than a local
  // guess — kept as a ref (not state) because it must be read at the moment a
  // new edit lands, not at whatever point the closure that captured it was
  // created.
  const draftRef = useRef<AlbumDTO | null>(null);
  const [past, setPast] = useState<Spread[][]>([]);
  const [future, setFuture] = useState<Spread[][]>([]);

  useEffect(() => {
    if (album.data) {
      draftRef.current = album.data;
      setDraft(album.data);
    }
  }, [album.data]);

  // Switching to a different album entirely starts its history fresh.
  useEffect(() => {
    draftRef.current = null;
    setPast([]);
    setFuture([]);
  }, [albumId]);

  const edit = useMutation({
    mutationFn: (command: AlbumEditInput) => editAlbum(albumId, command),
    onSuccess: (updated) => {
      queryClient.setQueryData(["album", albumId], updated);
      applyUpdate(updated);
      void queryClient.invalidateQueries({ queryKey: ["albums", projectId] });
    },
  });

  // Every memoised child takes callbacks from here, so they must keep the same
  // identity across renders. The mutation object does not, so route through a ref.
  const editRef = useRef(edit.mutate);
  editRef.current = edit.mutate;
  const runEdit = useCallback((command: AlbumEditInput) => editRef.current(command), []);

  // Records a server-confirmed edit: pushes the state it replaced onto the
  // undo stack and clears redo, since a fresh edit invalidates whatever could
  // have been replayed forward. Undo/redo themselves bypass this — they
  // manage the stacks directly so replaying history doesn't get recorded
  // as a new entry in it.
  const applyUpdate = useCallback((updated: AlbumDTO) => {
    const previous = draftRef.current;
    if (previous) setPast((stack) => [...stack, previous.spreads]);
    setFuture([]);
    draftRef.current = updated;
    setDraft(updated);
  }, []);

  const historyMove = useRef<{ direction: "undo" | "redo"; leaving: Spread[] } | null>(null);
  const restoreSpreads = useMutation({
    mutationFn: (spreads: Spread[]) => editAlbum(albumId, { type: "RESTORE_SPREADS", spreads }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["album", albumId], updated);
      draftRef.current = updated;
      setDraft(updated);
      const pending = historyMove.current;
      historyMove.current = null;
      if (!pending) return;
      if (pending.direction === "undo") {
        setPast((stack) => stack.slice(0, -1));
        setFuture((stack) => [...stack, pending.leaving]);
      } else {
        setFuture((stack) => stack.slice(0, -1));
        setPast((stack) => [...stack, pending.leaving]);
      }
    },
  });

  const undo = useCallback(() => {
    const previous = past[past.length - 1];
    const leaving = draftRef.current;
    if (!previous || !leaving || restoreSpreads.isPending) return;
    historyMove.current = { direction: "undo", leaving: leaving.spreads };
    restoreSpreads.mutate(previous);
  }, [past, restoreSpreads]);

  const redo = useCallback(() => {
    const next = future[future.length - 1];
    const leaving = draftRef.current;
    if (!next || !leaving || restoreSpreads.isPending) return;
    historyMove.current = { direction: "redo", leaving: leaving.spreads };
    restoreSpreads.mutate(next);
  }, [future, restoreSpreads]);

  const handleCropChange = useCallback(
    (spreadIndex: number, slotId: string, crop: Crop, commit: boolean) => {
      setDraft((current) => {
        if (!current) return current;
        const spreads = current.spreads.map((spread, index) =>
          index !== spreadIndex
            ? spread
            : {
                ...spread,
                placements: spread.placements.map((placement) =>
                  placement.slotId === slotId ? { ...placement, crop } : placement,
                ),
              },
        );
        return { ...current, spreads };
      });

      if (pendingCrop.current) clearTimeout(pendingCrop.current);
      const send = () => runEdit({ type: "SET_CROP", spreadIndex, slotId, crop });
      if (commit) send();
      else pendingCrop.current = setTimeout(send, 400);
    },
    [runEdit],
  );

  const pendingFrame = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFrameChange = useCallback(
    (spreadIndex: number, slotId: string, frame: SlotFrame, commit: boolean) => {
      setDraft((current) => {
        if (!current) return current;
        return {
          ...current,
          spreads: current.spreads.map((spread, index) =>
            index !== spreadIndex
              ? spread
              : {
                  ...spread,
                  placements: spread.placements.map((placement) =>
                    placement.slotId === slotId ? { ...placement, frame } : placement,
                  ),
                },
          ),
        };
      });

      if (pendingFrame.current) clearTimeout(pendingFrame.current);
      const send = () => runEdit({ type: "SET_FRAME", spreadIndex, slotId, frame });
      if (commit) send();
      else pendingFrame.current = setTimeout(send, 400);
    },
    [runEdit],
  );

  // Declared before the mutations that close over it, so those closures can never
  // observe it uninitialised on a render that bails out early.
  const current = draft ?? album.data;

  // Suggestions are keyed by the photo set, so shuffling a spread never refetches.
  const suggestionCache = useRef<Map<string, LayoutSuggestionDTO[]>>(new Map());

  const suggestionsFor = useCallback(
    async (photoIds: string[]): Promise<LayoutSuggestionDTO[]> => {
      const key = [...photoIds].sort().join("|");
      const cached = suggestionCache.current.get(key);
      if (cached) return cached;
      const fresh = await suggestSpreadLayouts(projectId, photoIds);
      suggestionCache.current.set(key, fresh);
      return fresh;
    },
    [projectId],
  );

  const addPickedAsSpread = useMutation({
    mutationFn: async () => {
      const ranked = await suggestionsFor(picked);
      const best = ranked[0];
      if (!best) throw new Error("No layout fits that many photos.");
      return editAlbum(albumId, {
        type: "ADD_SPREAD",
        atIndex: current?.spreads.length ?? 0,
        templateId: best.templateId,
        photoIds: best.photoIds,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["album", albumId], updated);
      applyUpdate(updated);
      setPicked([]);
    },
  });

  const shuffle = useMutation({
    mutationFn: async (spreadIndex: number) => {
      const spread = current?.spreads[spreadIndex];
      if (!spread) throw new Error("That spread is gone.");
      const photoIds = spread.placements.map((placement) => placement.photoId).filter(Boolean);
      const ranked = await suggestionsFor(photoIds);
      if (ranked.length < 2) throw new Error("No other layout holds this many photos.");

      const currentIndex = ranked.findIndex((entry) => entry.templateId === spread.templateId);
      const next = ranked[(currentIndex + 1) % ranked.length];
      if (!next) throw new Error("No alternative layout found.");
      return editAlbum(albumId, {
        type: "CHANGE_TEMPLATE",
        spreadIndex,
        templateId: next.templateId,
        photoIds: next.photoIds,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["album", albumId], updated);
      applyUpdate(updated);
    },
  });

  // Growing a spread past its template's own slot count: no new endpoint —
  // this is exactly what "shuffle design" already does (suggest layouts for a
  // photo set, apply the best-ranked one), just for the existing photos plus
  // one more, rather than for a shuffle among templates of the same size.
  const addPhotoToSpread = useMutation({
    mutationFn: async ({ spreadIndex, photoId }: { spreadIndex: number; photoId: string }) => {
      const spread = current?.spreads[spreadIndex];
      if (!spread) throw new Error("That spread is gone.");
      const existingPhotoIds = spread.placements
        .map((placement) => placement.photoId)
        .filter(Boolean);
      if (existingPhotoIds.includes(photoId)) {
        throw new Error("That photo is already on this spread.");
      }
      const grown = [...existingPhotoIds, photoId];
      if (grown.length > MAX_PHOTOS_PER_SPREAD) {
        throw new Error(`A spread holds at most ${MAX_PHOTOS_PER_SPREAD} photos.`);
      }
      const ranked = await suggestionsFor(grown);
      const best = ranked[0];
      if (!best) throw new Error(`No layout holds ${grown.length} photos.`);
      return editAlbum(albumId, {
        type: "CHANGE_TEMPLATE",
        spreadIndex,
        templateId: best.templateId,
        photoIds: best.photoIds,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["album", albumId], updated);
      applyUpdate(updated);
    },
  });

  // The inverse of addPhotoToSpread: shrink instead of grow, same re-suggest
  // step either way. Refuses to go to zero — a spread with no photos has
  // nothing for any template to hold; "Remove" (the whole spread) is the
  // right action there instead, not a photo count of zero.
  const removePhotoFromSpread = useMutation({
    mutationFn: async ({ spreadIndex, slotId }: { spreadIndex: number; slotId: string }) => {
      const spread = current?.spreads[spreadIndex];
      if (!spread) throw new Error("That spread is gone.");
      const shrunk = spread.placements
        .filter((placement) => placement.slotId !== slotId)
        .map((placement) => placement.photoId)
        .filter(Boolean);
      if (shrunk.length === 0) {
        throw new Error("A spread needs at least one photo — remove the whole spread instead.");
      }
      const ranked = await suggestionsFor(shrunk);
      const best = ranked[0];
      if (!best) throw new Error(`No layout holds ${shrunk.length} photos.`);
      return editAlbum(albumId, {
        type: "CHANGE_TEMPLATE",
        spreadIndex,
        templateId: best.templateId,
        photoIds: best.photoIds,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["album", albumId], updated);
      applyUpdate(updated);
    },
  });

  const resolveFeedback = useMutation({
    mutationFn: (commentId: string) => resolveComment(albumId, commentId),
    onSuccess: (updated) => queryClient.setQueryData(["feedback", albumId], updated),
  });

  const share = useMutation({
    mutationFn: () => openReviewSession(albumId, clientName || "Client"),
    onSuccess: (session) => {
      setShareLink(`${window.location.origin}/review/${session.token}`);
      void queryClient.invalidateQueries({ queryKey: ["reviews", albumId] });
      void queryClient.invalidateQueries({ queryKey: ["album", albumId] });
    },
  });

  const startExport = useMutation({
    mutationFn: () => requestExport(albumId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exports", albumId] }),
  });

  const removeExport = useMutation({
    mutationFn: (exportJobId: string) => deleteExport(exportJobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exports", albumId] }),
  });

  const removeAlbum = useMutation({
    mutationFn: () => deleteAlbum(albumId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["album", albumId] });
      navigate(projectId ? `/projects/${projectId}` : "/");
    },
  });

  const previewByPhoto = useMemo(
    () => new Map((photos.data ?? []).map((photo) => [photo.id, photo.previewUrl])),
    [photos.data],
  );
  const templateById = useMemo(
    () => new Map((templates.data ?? []).map((template) => [template.id, template])),
    [templates.data],
  );
  const templateList = useMemo(() => templates.data ?? [], [templates.data]);
  const commentsBySpread = useMemo(
    () => openCommentsBySpread(feedback.data?.comments ?? []),
    [feedback.data],
  );
  const trayPhotos = useMemo(
    () => (photos.data ?? []).filter((photo) => photo.thumbnailUrl ?? photo.previewUrl),
    [photos.data],
  );
  const analysisByPhoto = useMemo(
    () => new Map((analyses.data ?? []).map((analysis) => [analysis.photoId, analysis])),
    [analyses.data],
  );
  // Every photo id placed on any spread, so the tray can flag a photo that's
  // already in the album rather than let it be added a second time by mistake.
  const usedPhotoIds = useMemo(
    () =>
      new Set(
        (current?.spreads ?? []).flatMap((spread) =>
          spread.placements.map((placement) => placement.photoId),
        ),
      ),
    [current],
  );

  // Every callback below is passed to a memoised child, so each one must keep its
  // identity across renders or the memo boundary buys nothing.
  const previewUrlFor = useCallback(
    (photoId: string) => previewByPhoto.get(photoId),
    [previewByPhoto],
  );
  const selectSlot = useCallback((spreadIndex: number, slotId: string) => {
    setAddingToSpread(null);
    setSelected({ spreadIndex, slotId });
  }, []);
  const reorderSpread = useCallback(
    (fromIndex: number, toIndex: number) =>
      runEdit({ type: "REORDER_SPREAD", fromIndex, toIndex }),
    [runEdit],
  );
  const resetFrames = useCallback(
    (spreadIndex: number) => runEdit({ type: "RESET_FRAMES", spreadIndex }),
    [runEdit],
  );
  const setSpreadTreatment = useCallback(
    (spreadIndex: number, treatment: PhotoTreatment) =>
      runEdit({ type: "SET_SPREAD_TREATMENT", spreadIndex, treatment }),
    [runEdit],
  );
  const removeSpread = useCallback(
    (index: number) => runEdit({ type: "REMOVE_SPREAD", index }),
    [runEdit],
  );
  const dropPhotoInSlot = useCallback(
    (spreadIndex: number, slotId: string, photoId: string) =>
      runEdit({ type: "SWAP_PHOTO", spreadIndex, slotId, photoId }),
    [runEdit],
  );
  const setSlotTreatment = useCallback(
    (spreadIndex: number, slotId: string, treatment: PhotoTreatment) =>
      runEdit({ type: "SET_TREATMENT", spreadIndex, slotId, treatment }),
    [runEdit],
  );
  const reorderPlacement = useCallback(
    (spreadIndex: number, fromSlotId: string, toSlotId: string) =>
      runEdit({ type: "REORDER_PLACEMENT", spreadIndex, fromSlotId, toSlotId }),
    [runEdit],
  );
  const moveToNeighbor = useCallback(
    (spreadIndex: number, slotIdA: string, slotIdB: string) =>
      runEdit({ type: "SWAP_PLACEMENTS", spreadIndex, slotIdA, slotIdB }),
    [runEdit],
  );
  const pickTemplate = useCallback(
    (spreadIndex: number, templateId: string) =>
      runEdit({ type: "CHANGE_TEMPLATE", spreadIndex, templateId }),
    [runEdit],
  );

  const jumpToComment = useCallback((comment: FeedbackComment) => {
    const target = document.getElementById(`spread-${comment.spreadIndex}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Selecting the slot the client named puts the editing tools straight onto it.
    if (comment.slotId) {
      setAddingToSpread(null);
      setSelected({ spreadIndex: comment.spreadIndex, slotId: comment.slotId });
    }
  }, []);

  const resolveRef = useRef(resolveFeedback.mutate);
  resolveRef.current = resolveFeedback.mutate;
  const markCommentDone = useCallback((commentId: string) => resolveRef.current(commentId), []);

  const shuffleRef = useRef(shuffle.mutate);
  shuffleRef.current = shuffle.mutate;
  const runShuffle = useCallback((spreadIndex: number) => shuffleRef.current(spreadIndex), []);

  const addPhotoRef = useRef(addPhotoToSpread.mutate);
  addPhotoRef.current = addPhotoToSpread.mutate;

  const armAddToSpread = useCallback((spreadIndex: number) => {
    setSelected(null);
    setAddingToSpread((current) => (current === spreadIndex ? null : spreadIndex));
  }, []);

  // Dragging a tray photo straight onto a spread's margins goes through the
  // exact same mutation as the click-to-add flow above — just a second,
  // more direct way to reach it, with no arming step required first.
  const addPhotoDrop = useCallback(
    (spreadIndex: number, photoId: string) => addPhotoRef.current({ spreadIndex, photoId }),
    [],
  );

  const removePhotoRef = useRef(removePhotoFromSpread.mutate);
  removePhotoRef.current = removePhotoFromSpread.mutate;
  const removePhoto = useCallback(
    (spreadIndex: number, slotId: string) => removePhotoRef.current({ spreadIndex, slotId }),
    [],
  );

  // Read through refs rather than closing over state, so the tray's click
  // handler keeps one identity for the life of the page.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const addingToSpreadRef = useRef(addingToSpread);
  addingToSpreadRef.current = addingToSpread;

  const trayPhotoClick = useCallback(
    (photoId: string) => {
      const growing = addingToSpreadRef.current;
      if (growing !== null) {
        addPhotoRef.current({ spreadIndex: growing, photoId });
        setAddingToSpread(null);
        return;
      }
      const slot = selectedRef.current;
      // A selected slot means "replace this"; otherwise build a set for a new spread.
      if (slot) {
        runEdit({
          type: "SWAP_PHOTO",
          spreadIndex: slot.spreadIndex,
          slotId: slot.slotId,
          photoId,
        });
        setSelected(null);
        return;
      }
      setPicked((prev) =>
        prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId],
      );
    },
    [runEdit],
  );

  if (album.isLoading) return <p className="page muted">Loading album…</p>;
  if (album.isError) return <p className="page error">{(album.error as Error).message}</p>;
  if (!current) return null;
  const locked = current.status === "APPROVED";
  const aspectRatio = (current.format.pageWidthMm * 2) / current.format.pageHeightMm;

  return (
    <div className="page editor">
      <header className="page__header">
        <div>
          <Link to={projectId ? `/projects/${projectId}` : "/"} className="muted back-link">
            ← Back to shoot
          </Link>
          <h1>{current.title}</h1>
          <p className="muted">
            {current.spreadCount} spreads · {current.pageCount} pages · {current.photoCount} photos
          </p>
        </div>
        <div className="page__header-actions">
          <button
            type="button"
            className="button button--small"
            title="Undo the last change"
            disabled={locked || past.length === 0 || restoreSpreads.isPending}
            onClick={undo}
          >
            ↶ Undo
          </button>
          <button
            type="button"
            className="button button--small"
            title="Redo the last undone change"
            disabled={locked || future.length === 0 || restoreSpreads.isPending}
            onClick={redo}
          >
            ↷ Redo
          </button>
          <label className="ruler-toggle" title="Show a centimetre grid behind every spread">
            <input
              type="checkbox"
              className="ruler-toggle__input"
              checked={showRuler}
              onChange={(event) => setShowRuler(event.target.checked)}
            />
            <span className="ruler-toggle__track" aria-hidden="true">
              <span className="ruler-toggle__thumb" />
            </span>
            Ruler
          </label>
          <label
            className="ruler-toggle"
            title="Snap a dragged corner to page edges, the centre, and other slots' edges"
          >
            <input
              type="checkbox"
              className="ruler-toggle__input"
              checked={snapEnabled}
              onChange={(event) => setSnapEnabled(event.target.checked)}
            />
            <span className="ruler-toggle__track" aria-hidden="true">
              <span className="ruler-toggle__thumb" />
            </span>
            Snap
          </label>
          <span className={`chip chip--${current.status.toLowerCase()}`}>{current.status}</span>
          {locked ? (
            <button
              type="button"
              className="button"
              onClick={() => edit.mutate({ type: "REOPEN" })}
            >
              Reopen for editing
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => edit.mutate({ type: "SUBMIT_FOR_REVIEW" })}
            >
              Mark ready for review
            </button>
          )}
          <button
            type="button"
            className="button button--primary"
            title="Delete this album and everything in it"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete album
          </button>
        </div>
      </header>

      {edit.isError && <p className="error">{(edit.error as Error).message}</p>}
      {restoreSpreads.isError && (
        <p className="error">{(restoreSpreads.error as Error).message}</p>
      )}
      {locked && (
        <p className="notice">
          This album is approved and locked. Reopen it if the client asked for another change.
        </p>
      )}

      <div className="editor__layout">
        <main className="spreads">
          {current.spreads.map((spread, spreadIndex) => (
            <SpreadBlock
              // Keyed by position alone. Including the template id would change the
              // key whenever the layout changed, remounting the section and forcing
              // the browser to re-decode every photo on it.
              key={spreadIndex}
              spread={spread}
              spreadIndex={spreadIndex}
              spreadCount={current.spreads.length}
              template={templateById.get(spread.templateId)}
              templates={templateList}
              previewUrlFor={previewUrlFor}
              aspectRatio={aspectRatio}
              pageWidthMm={current.format.pageWidthMm}
              pageHeightMm={current.format.pageHeightMm}
              showRuler={showRuler}
              snapEnabled={snapEnabled}
              selectedSlotId={
                selected?.spreadIndex === spreadIndex ? selected.slotId : null
              }
              locked={locked}
              shuffling={shuffle.isPending}
              addingPhoto={addingToSpread === spreadIndex}
              addPhotoDisabled={spread.placements.length >= MAX_PHOTOS_PER_SPREAD}
              openComments={commentsBySpread.get(spreadIndex) ?? 0}
              onSelectSlot={selectSlot}
              onReorder={reorderSpread}
              onResetFrames={resetFrames}
              onShuffle={runShuffle}
              onAddPhoto={armAddToSpread}
              onSpreadTreatment={setSpreadTreatment}
              onRemove={removeSpread}
              onSlotDrop={dropPhotoInSlot}
              onCropChange={handleCropChange}
              onTreatmentChange={setSlotTreatment}
              onFrameChange={handleFrameChange}
              onReorderPlacement={reorderPlacement}
              onMoveToNeighbor={moveToNeighbor}
              onPickTemplate={pickTemplate}
              onAddPhotoDrop={addPhotoDrop}
              onRemovePhoto={removePhoto}
            />
          ))}

          {!locked && (
            <button
              type="button"
              className="button add-spread"
              onClick={() =>
                edit.mutate({
                  type: "ADD_SPREAD",
                  atIndex: current.spreads.length,
                  templateId: "single-centred",
                  photoIds: [],
                })
              }
            >
              + Add spread
            </button>
          )}
        </main>

        <aside className="sidebar">
          <section className="panel">
            <h2>Photo tray</h2>
            <p className="muted">
              {addingToSpread !== null
                ? `Click a photo to add it to spread ${addingToSpread + 1}.`
                : selected
                  ? `Click a photo to drop it into spread ${selected.spreadIndex + 1}.`
                  : "Pick photos to build a new spread, or drag one onto any slot."}
            </p>

            {picked.length > 0 && (
              <div className="picked-bar">
                <span>
                  {picked.length} selected
                  {picked.length > MAX_PHOTOS_PER_SPREAD &&
                    ` — a spread holds at most ${MAX_PHOTOS_PER_SPREAD}`}
                </span>
                <div className="picked-bar__actions">
                  <button type="button" className="button button--small" onClick={() => setPicked([])}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="button button--small button--primary"
                    disabled={
                      locked || picked.length > MAX_PHOTOS_PER_SPREAD || addPickedAsSpread.isPending
                    }
                    onClick={() => addPickedAsSpread.mutate()}
                  >
                    {addPickedAsSpread.isPending ? "Adding…" : "Add as spread"}
                  </button>
                </div>
              </div>
            )}
            {addPickedAsSpread.isError && (
              <p className="error">{(addPickedAsSpread.error as Error).message}</p>
            )}
            {shuffle.isError && <p className="error">{(shuffle.error as Error).message}</p>}
            {addPhotoToSpread.isError && (
              <p className="error">{(addPhotoToSpread.error as Error).message}</p>
            )}
            {removePhotoFromSpread.isError && (
              <p className="error">{(removePhotoFromSpread.error as Error).message}</p>
            )}

            <PhotoTray
              photos={trayPhotos}
              picked={picked}
              locked={locked}
              onPhotoClick={trayPhotoClick}
              analysisByPhoto={analysisByPhoto}
              usedPhotoIds={usedPhotoIds}
            />
          </section>

          <section className="panel">
            <h2>Client review</h2>
            <div className="field">
              <label htmlFor="client-name">Client name</label>
              <input
                id="client-name"
                value={clientName}
                placeholder="Client name"
                onChange={(event) => setClientName(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="button button--primary"
              disabled={share.isPending}
              onClick={() => share.mutate()}
            >
              {share.isPending ? "Creating…" : "Create share link"}
            </button>
            {shareLink && (
              <p className="share-link">
                <a href={shareLink}>{shareLink}</a>
              </p>
            )}
            {(reviews.data ?? []).map((session) => (
              <p key={session.id} className="muted">
                {session.clientName} — {session.status}
                {session.openComments > 0 && ` · ${session.openComments} open comments`}
              </p>
            ))}
          </section>

          <section className="panel">
            <h2>
              Client feedback
              {(feedback.data?.openCount ?? 0) > 0 && (
                <span className="panel__badge">{feedback.data?.openCount}</span>
              )}
            </h2>
            {resolveFeedback.isError && (
              <p className="error">{(resolveFeedback.error as Error).message}</p>
            )}
            <ClientFeedback
              feedback={feedback.data}
              loading={feedback.isLoading}
              error={feedback.isError ? (feedback.error as Error) : null}
              resolvingId={resolveFeedback.isPending ? (resolveFeedback.variables ?? null) : null}
              onJumpTo={jumpToComment}
              onResolve={markCommentDone}
            />
          </section>

          <section className="panel">
            <h2>Export</h2>
            <button
              type="button"
              className="button"
              disabled={startExport.isPending}
              onClick={() => startExport.mutate()}
            >
              {startExport.isPending ? "Queueing…" : "Export print-ready PDF"}
            </button>
            {startExport.isError && (
              <p className="error">{(startExport.error as Error).message}</p>
            )}
            {removeExport.isError && (
              <p className="error">{(removeExport.error as Error).message}</p>
            )}
            <ul className="export-list">
              {(exports.data ?? []).map((job) => {
                const inProgress = job.status === "QUEUED" || job.status === "RENDERING";
                return (
                <li key={job.id}>
                  <span className={`chip chip--${job.status.toLowerCase()}`}>{job.status}</span>
                  {job.status === "READY" ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={async () => {
                        const { url } = await getExportDownload(job.id);
                        window.open(url, "_blank", "noopener");
                      }}
                    >
                      Download ({Math.round((job.byteSize ?? 0) / 1024)} KB)
                    </button>
                  ) : (
                    <span className="muted">{job.failureReason ?? `${job.printProfileId}`}</span>
                  )}
                  <button
                    type="button"
                    className="button button--small button--danger"
                    title={
                      inProgress
                        ? "This export is still in progress"
                        : "Delete this export"
                    }
                    disabled={inProgress || removeExport.isPending}
                    onClick={() => {
                      if (window.confirm("Delete this export? This cannot be undone.")) {
                        removeExport.mutate(job.id);
                      }
                    }}
                  >
                    {removeExport.isPending && removeExport.variables === job.id
                      ? "Deleting…"
                      : "Delete"}
                  </button>
                </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>

      {confirmingDelete && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => !removeAlbum.isPending && setConfirmingDelete(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-album-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-album-title">Delete this album?</h2>
            <p>
              This permanently removes <strong>{current.title}</strong> — every spread, its
              exports, and any review links already sent to the client. This cannot be undone.
            </p>
            {removeAlbum.isError && <p className="error">{(removeAlbum.error as Error).message}</p>}
            <div className="modal__actions">
              <button
                type="button"
                className="button"
                disabled={removeAlbum.isPending}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={removeAlbum.isPending}
                onClick={() => removeAlbum.mutate()}
              >
                {removeAlbum.isPending ? "Deleting…" : "Delete album"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
