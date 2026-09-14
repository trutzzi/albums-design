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
  listReviewSessions,
  openReviewSession,
  requestExport,
  suggestSpreadLayouts,
} from "../../lib/api";
import { SpreadCanvas } from "../../components/SpreadCanvas";
import { LayoutPicker } from "../../components/LayoutPicker";

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
      const send = () => edit.mutate({ type: "SET_CROP", spreadIndex, slotId, crop });
      if (commit) send();
      else pendingCrop.current = setTimeout(send, 400);
    },
    [edit],
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
      const send = () => edit.mutate({ type: "SET_FRAME", spreadIndex, slotId, frame });
      if (commit) send();
      else pendingFrame.current = setTimeout(send, 400);
    },
    [edit],
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
          {current.spreads.map((spread, spreadIndex) => {
            const template = templateById.get(spread.templateId);
            return (
              <section key={`${spread.templateId}-${spreadIndex}`} className="spread-block">
                <div className="spread-block__head">
                  <h2>Spread {spreadIndex + 1}</h2>
                  <div className="spread-block__actions">
                    <button
                      type="button"
                      className="button button--small"
                      disabled={locked || spreadIndex === 0}
                      onClick={() =>
                        edit.mutate({
                          type: "REORDER_SPREAD",
                          fromIndex: spreadIndex,
                          toIndex: spreadIndex - 1,
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="button button--small"
                      disabled={locked || spreadIndex === current.spreads.length - 1}
                      onClick={() =>
                        edit.mutate({
                          type: "REORDER_SPREAD",
                          fromIndex: spreadIndex,
                          toIndex: spreadIndex + 1,
                        })
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="button button--small"
                      disabled={locked || !spreadHasCustomFrames(spread.placements)}
                      title="Put every photo back where the template had it"
                      onClick={() => edit.mutate({ type: "RESET_FRAMES", spreadIndex })}
                    >
                      Reset layout
                    </button>
                    <button
                      type="button"
                      className="button button--small"
                      disabled={locked || shuffle.isPending}
                      title="Try the next layout that fits these photos"
                      onClick={() => shuffle.mutate(spreadIndex)}
                    >
                      Shuffle design
                    </button>
                    <button
                      type="button"
                      className="button button--small"
                      disabled={locked}
                      title="Toggle black and white for the whole spread"
                      onClick={() =>
                        edit.mutate({
                          type: "SET_SPREAD_TREATMENT",
                          spreadIndex,
                          treatment: spreadIsMono(spread.placements)
                            ? "COLOR"
                            : ("BLACK_WHITE" as PhotoTreatment),
                        })
                      }
                    >
                      {spreadIsMono(spread.placements) ? "Colour" : "B&W"}
                    </button>
                    <button
                      type="button"
                      className="button button--small button--danger"
                      disabled={locked || current.spreads.length === 1}
                      onClick={() => edit.mutate({ type: "REMOVE_SPREAD", index: spreadIndex })}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <SpreadCanvas
                  template={template}
                  placements={spread.placements}
                  previewUrlFor={(photoId) => previewByPhoto.get(photoId)}
                  aspectRatio={aspectRatio}
                  selectedSlotId={
                    selected?.spreadIndex === spreadIndex ? selected.slotId : null
                  }
                  onSlotClick={
                    locked ? undefined : (slotId) => setSelected({ spreadIndex, slotId })
                  }
                  onSlotDrop={
                    locked
                      ? undefined
                      : (slotId, photoId) =>
                          edit.mutate({ type: "SWAP_PHOTO", spreadIndex, slotId, photoId })
                  }
                  onCropChange={
                    locked
                      ? undefined
                      : (slotId, crop, commit) =>
                          handleCropChange(spreadIndex, slotId, crop, commit)
                  }
                  onTreatmentChange={
                    locked
                      ? undefined
                      : (slotId, treatment) =>
                          edit.mutate({ type: "SET_TREATMENT", spreadIndex, slotId, treatment })
                  }
                  onFrameChange={
                    locked
                      ? undefined
                      : (slotId, frame, commit) =>
                          handleFrameChange(spreadIndex, slotId, frame, commit)
                  }
                  onSwapSlots={
                    locked
                      ? undefined
                      : (slotIdA, slotIdB) =>
                          edit.mutate({ type: "SWAP_PLACEMENTS", spreadIndex, slotIdA, slotIdB })
                  }
                />

                <LayoutPicker
                  templates={templates.data ?? []}
                  photoCount={spread.placements.length}
                  currentTemplateId={spread.templateId}
                  disabled={locked}
                  onPick={(templateId) =>
                    edit.mutate({ type: "CHANGE_TEMPLATE", spreadIndex, templateId })
                  }
                />
              </section>
            );
          })}

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

            <div className="tray">
              {(photos.data ?? [])
                .filter((photo) => photo.previewUrl)
                .map((photo) => {
                  const pickIndex = picked.indexOf(photo.id);
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      className={`tray__item ${pickIndex >= 0 ? "tray__item--picked" : ""}`}
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData("text/photo-id", photo.id)
                      }
                      disabled={locked}
                      onClick={() => {
                        // A selected slot means "replace this"; otherwise build a set.
                        if (selected) {
                          edit.mutate({
                            type: "SWAP_PHOTO",
                            spreadIndex: selected.spreadIndex,
                            slotId: selected.slotId,
                            photoId: photo.id,
                          });
                          setSelected(null);
                          return;
                        }
                        setPicked((prev) =>
                          pickIndex >= 0
                            ? prev.filter((id) => id !== photo.id)
                            : [...prev, photo.id],
                        );
                      }}
                    >
                      <img src={photo.previewUrl ?? ""} alt={photo.fileName} loading="lazy" />
                      {pickIndex >= 0 && <span className="tray__badge">{pickIndex + 1}</span>}
                    </button>
                  );
                })}
            </div>
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

function spreadIsMono(placements: { treatment?: PhotoTreatment }[]): boolean {
  return placements.length > 0 && placements.every((p) => p.treatment === "BLACK_WHITE");
}

function spreadHasCustomFrames(placements: { frame?: unknown }[]): boolean {
  return placements.some((placement) => placement.frame !== undefined);
}
