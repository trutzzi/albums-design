import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
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
  getAlbum,
  getExportDownload,
  listExports,
  listLayoutTemplates,
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

export function AlbumEditorPage() {
  const { albumId = "" } = useParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ spreadIndex: number; slotId: string } | null>(null);
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

  const edit = useMutation({
    mutationFn: (command: AlbumEditInput) => editAlbum(albumId, command),
    onSuccess: (updated) => {
      queryClient.setQueryData(["album", albumId], updated);
      setDraft(updated);
      void queryClient.invalidateQueries({ queryKey: ["albums", projectId] });
    },
  });

  // Every memoised child takes callbacks from here, so they must keep the same
  // identity across renders. The mutation object does not, so route through a ref.
  const editRef = useRef(edit.mutate);
  editRef.current = edit.mutate;
  const runEdit = useCallback((command: AlbumEditInput) => editRef.current(command), []);

  // Dragging updates 60x a second; the server only needs the frame you settle on.
  const [draft, setDraft] = useState<AlbumDTO | null>(null);
  const pendingCrop = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (album.data) setDraft(album.data);
  }, [album.data]);

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
      setDraft(updated);
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
      setDraft(updated);
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

  // Every callback below is passed to a memoised child, so each one must keep its
  // identity across renders or the memo boundary buys nothing.
  const previewUrlFor = useCallback(
    (photoId: string) => previewByPhoto.get(photoId),
    [previewByPhoto],
  );
  const selectSlot = useCallback(
    (spreadIndex: number, slotId: string) => setSelected({ spreadIndex, slotId }),
    [],
  );
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
  const swapSlots = useCallback(
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
      setSelected({ spreadIndex: comment.spreadIndex, slotId: comment.slotId });
    }
  }, []);

  const resolveRef = useRef(resolveFeedback.mutate);
  resolveRef.current = resolveFeedback.mutate;
  const markCommentDone = useCallback((commentId: string) => resolveRef.current(commentId), []);

  const shuffleRef = useRef(shuffle.mutate);
  shuffleRef.current = shuffle.mutate;
  const runShuffle = useCallback((spreadIndex: number) => shuffleRef.current(spreadIndex), []);

  // Read through a ref rather than closing over `selected`, so the tray's click
  // handler keeps one identity for the life of the page.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const trayPhotoClick = useCallback(
    (photoId: string) => {
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
        </div>
      </header>

      {edit.isError && <p className="error">{(edit.error as Error).message}</p>}
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
              selectedSlotId={
                selected?.spreadIndex === spreadIndex ? selected.slotId : null
              }
              locked={locked}
              shuffling={shuffle.isPending}
              openComments={commentsBySpread.get(spreadIndex) ?? 0}
              onSelectSlot={selectSlot}
              onReorder={reorderSpread}
              onResetFrames={resetFrames}
              onShuffle={runShuffle}
              onSpreadTreatment={setSpreadTreatment}
              onRemove={removeSpread}
              onSlotDrop={dropPhotoInSlot}
              onCropChange={handleCropChange}
              onTreatmentChange={setSlotTreatment}
              onFrameChange={handleFrameChange}
              onSwapSlots={swapSlots}
              onPickTemplate={pickTemplate}
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
              {selected
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

            <PhotoTray
              photos={trayPhotos}
              picked={picked}
              locked={locked}
              onPhotoClick={trayPhotoClick}
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
            <ul className="export-list">
              {(exports.data ?? []).map((job) => (
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
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
