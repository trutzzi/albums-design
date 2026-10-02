import { useCallback, useMemo, useRef, useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PhotoTreatment } from "@albumflow/contracts";
import {
  DEFAULT_STYLE,
  MAX_PHOTOS_PER_SPREAD,
  type AlbumCoverDTO,
  type AlbumStyleDTO,
  type TextBlockDTO,
} from "@albumflow/contracts";
import {
  deleteAlbum,
  getAlbum,
  getAlbumFeedback,
  listLayoutTemplates,
  listPickSessions,
  listProjectAnalyses,
  listProjectPhotos,
  type FeedbackComment,
} from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { GuidedTour, type TourStep } from "@/shared/ui/GuidedTour";
import { CoverEditor } from "@/shared/album/CoverEditor";
import { BookPreview } from "@/shared/album/BookPreview";
import { checkAlbum, issuesBySpread } from "@/features/album-editor/lib/album-check";
import { chapterStarts } from "@/features/album-editor/lib/chapters";
import { useAlbumDraft } from "@/features/album-editor/hooks/useAlbumDraft";
import { useSpreadLayouts } from "@/features/album-editor/hooks/useSpreadLayouts";
import { usePhotoTray } from "@/features/album-editor/hooks/usePhotoTray";
import { usePrintGuides } from "@/features/album-editor/hooks/usePrintGuides";
import { useEditorShortcuts } from "@/features/album-editor/hooks/useEditorShortcuts";
import { useCurrentSpread, useHeaderHeightVariable } from "@/features/album-editor/hooks/useEditorLayout";
import { SpreadBlock } from "@/features/album-editor/components/SpreadBlock";
import { StylePanel } from "@/features/album-editor/components/StylePanel";
import { PageStrip } from "@/features/album-editor/components/PageStrip";
import { AlbumCheckPanel } from "@/features/album-editor/components/AlbumCheckPanel";
import { ShortcutsHelp } from "@/features/album-editor/components/ShortcutsHelp";
import { openCommentsBySpread } from "@/features/album-editor/components/ClientFeedback";
import { EditorToolbar } from "@/features/album-editor/components/EditorToolbar";
import { TrayPanel } from "@/features/album-editor/components/TrayPanel";
import { ReviewPanel } from "@/features/album-editor/components/ReviewPanel";
import { FeedbackPanel } from "@/features/album-editor/components/FeedbackPanel";
import { ExportPanel } from "@/features/album-editor/components/ExportPanel";
import { PrintGuidesModal } from "@/features/album-editor/components/PrintGuidesModal";
import { InsertSpreadModal } from "@/features/album-editor/components/InsertSpreadModal";

const EDITOR_TOUR: TourStep[] = [
  { target: '[data-tour="editor-cover"]', titleKey: "tour.editor.cover.title", bodyKey: "tour.editor.cover.body" },
  { target: '[data-tour="editor-spread"]', titleKey: "tour.editor.spread.title", bodyKey: "tour.editor.spread.body" },
  {
    target: '[data-tour="editor-spread-actions"]',
    titleKey: "tour.editor.actions.title",
    bodyKey: "tour.editor.actions.body",
  },
  {
    target: '[data-tour="editor-layouts"]',
    titleKey: "tour.editor.layouts.title",
    bodyKey: "tour.editor.layouts.body",
  },
  {
    target: '[data-tour="editor-sidebar"]',
    titleKey: "tour.editor.sidebar.title",
    bodyKey: "tour.editor.sidebar.body",
  },
  { target: '[data-tour="editor-tools"]', titleKey: "tour.editor.tools.title", bodyKey: "tour.editor.tools.body" },
  { target: '[data-tour="editor-strip"]', titleKey: "tour.editor.strip.title", bodyKey: "tour.editor.strip.body" },
  { target: '[data-tour="editor-check"]', titleKey: "tour.editor.check.title", bodyKey: "tour.editor.check.body" },
  { target: '[data-tour="editor-ready"]', titleKey: "tour.editor.ready.title", bodyKey: "tour.editor.ready.body" },
];

type SidebarTab = "photos" | "design" | "review" | "export";

/**
 * The album editor: the cover and every spread down the middle, a sidebar of photos,
 * design, review and export, and a page strip along the bottom. Editing state lives in
 * hooks (useAlbumDraft, useSpreadLayouts, usePhotoTray); this page wires them together.
 */
export function AlbumEditorPage() {
  const { albumId = "" } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ spreadIndex: number; slotId: string } | null>(null);
  // A photo and a text block are never both selected: each one's tools sit in the same place.
  const [selectedText, setSelectedText] = useState<{ spreadIndex: number; blockId: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Armed by "+ Add photo" on a spread: the next tray click grows that spread
  // instead of replacing a slot or building a new one. Mutually exclusive with
  // `selected` — engaging one clears the other, so a click is never ambiguous.
  const [addingToSpread, setAddingToSpread] = useState<number | null>(null);
  // Set to the position a new spread should land at when the "+" between two
  // spreads (or "+ Add spread" at the end) is clicked — non-null shows the
  // layout-choice modal.
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [showRuler, setShowRuler] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  // The sidebar shows one section at a time, so the photo tray can use the whole height of the window.
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("photos");
  const [checkOpen, setCheckOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const saving = useIsMutating() > 0;
  const guides = usePrintGuides();

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
  // What clients chose in a submitted selection, for the tray's "client picks" filter.
  const pickSessions = useQuery({
    queryKey: ["pick-sessions", projectId],
    queryFn: () => listPickSessions(projectId),
    enabled: projectId !== "",
  });
  const feedback = useQuery({
    queryKey: ["feedback", albumId],
    queryFn: () => getAlbumFeedback(albumId),
    // A client may be reviewing while the photographer edits, so notes arrive
    // without a page reload.
    refetchInterval: 30000,
  });

  const draft = useAlbumDraft(albumId, album.data);
  const { current, runEdit } = draft;
  const spreadCount = current?.spreads.length ?? 0;
  const [currentSpread, setCurrentSpread] = useCurrentSpread(spreadCount);
  const layouts = useSpreadLayouts({ albumId, projectId, album: current, currentSpread, commit: draft.commit });

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
  const thumbnailByPhoto = useMemo(
    () => new Map((photos.data ?? []).map((photo) => [photo.id, photo.thumbnailUrl ?? photo.previewUrl])),
    [photos.data],
  );
  const templateById = useMemo(
    () => new Map((templates.data ?? []).map((template) => [template.id, template])),
    [templates.data],
  );
  const templateList = useMemo(() => templates.data ?? [], [templates.data]);
  const commentsBySpread = useMemo(() => openCommentsBySpread(feedback.data?.comments ?? []), [feedback.data]);
  const analysisByPhoto = useMemo(
    () => new Map((analyses.data ?? []).map((analysis) => [analysis.photoId, analysis])),
    [analyses.data],
  );
  // Every photo id placed on any spread, so the tray can flag a photo that's
  // already in the album rather than let it be added a second time by mistake.
  const usedPhotoIds = useMemo(
    () =>
      new Set((current?.spreads ?? []).flatMap((spread) => spread.placements.map((placement) => placement.photoId))),
    [current],
  );
  const clientPickedIds = useMemo(
    () =>
      new Set(
        (pickSessions.data ?? [])
          .filter((session) => session.status === "SUBMITTED")
          .flatMap((session) => session.pickedPhotoIds),
      ),
    [pickSessions.data],
  );
  const tray = usePhotoTray({
    photos: photos.data,
    analyses: analyses.data,
    analysisByPhoto,
    clientPickedIds,
    usedPhotoIds,
  });

  const issues = useMemo(
    () =>
      current && photos.data
        ? checkAlbum({
            album: { ...current, style: current.style ?? DEFAULT_STYLE },
            templates: templateById,
            analyses: analysisByPhoto,
            existingPhotoIds: new Set(photos.data.map((photo) => photo.id)),
          })
        : [],
    [current, photos.data, templateById, analysisByPhoto],
  );
  const issueCounts = useMemo(() => issuesBySpread(issues), [issues]);
  const needsAttention = issues.filter((issue) => issue.severity !== "info").length;
  const chapters = useMemo(
    () => chapterStarts(current?.spreads ?? [], analysisByPhoto),
    [current?.spreads, analysisByPhoto],
  );

  // Every callback below is passed to a memoised child, so each one must keep its
  // identity across renders or the memo boundary buys nothing.
  const previewUrlFor = useCallback((photoId: string) => previewByPhoto.get(photoId), [previewByPhoto]);
  const thumbnailUrlFor = useCallback((photoId: string) => thumbnailByPhoto.get(photoId), [thumbnailByPhoto]);
  const focusFor = useCallback((photoId: string) => analysisByPhoto.get(photoId)?.focus, [analysisByPhoto]);
  const closeTools = useCallback(() => {
    setSelected(null);
    setSelectedText(null);
  }, []);
  const selectSlot = useCallback((spreadIndex: number, slotId: string) => {
    setAddingToSpread(null);
    setSelectedText(null);
    setSelected({ spreadIndex, slotId });
  }, []);

  const addText = useCallback(
    (spreadIndex: number) => {
      const block: TextBlockDTO = {
        id: crypto.randomUUID().slice(0, 12),
        text: "",
        x: 0.3,
        y: 0.42,
        width: 0.4,
        height: 0.14,
        size: "heading",
        align: "center",
      };
      runEdit({ type: "SET_TEXT_BLOCK", spreadIndex, block });
      setSelected(null);
      setSelectedText({ spreadIndex, blockId: block.id });
    },
    [runEdit],
  );
  const selectText = useCallback((spreadIndex: number, blockId: string) => {
    setSelected(null);
    setAddingToSpread(null);
    setSelectedText({ spreadIndex, blockId });
  }, []);
  const { removeText: removeTextBlock } = draft;
  const removeText = useCallback(
    (spreadIndex: number, blockId: string) => {
      removeTextBlock(spreadIndex, blockId);
      setSelectedText(null);
    },
    [removeTextBlock],
  );
  const setStyle = useCallback((style: AlbumStyleDTO) => runEdit({ type: "SET_STYLE", style }), [runEdit]);
  const setCover = useCallback((cover: AlbumCoverDTO | null) => runEdit({ type: "SET_COVER", cover }), [runEdit]);
  const reorderSpread = useCallback(
    (fromIndex: number, toIndex: number) => runEdit({ type: "REORDER_SPREAD", fromIndex, toIndex }),
    [runEdit],
  );
  const resetFrames = useCallback((spreadIndex: number) => runEdit({ type: "RESET_FRAMES", spreadIndex }), [runEdit]);
  const setSpreadTreatment = useCallback(
    (spreadIndex: number, treatment: PhotoTreatment) =>
      runEdit({ type: "SET_SPREAD_TREATMENT", spreadIndex, treatment }),
    [runEdit],
  );
  const removeSpread = useCallback((index: number) => runEdit({ type: "REMOVE_SPREAD", index }), [runEdit]);
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
  const movePlacementAcrossSpreads = useCallback(
    (fromSpreadIndex: number, fromSlotId: string, toSpreadIndex: number, toSlotId: string) =>
      runEdit({ type: "MOVE_PLACEMENT_ACROSS_SPREADS", fromSpreadIndex, fromSlotId, toSpreadIndex, toSlotId }),
    [runEdit],
  );
  const pickTemplate = useCallback(
    (spreadIndex: number, templateId: string) => runEdit({ type: "CHANGE_TEMPLATE", spreadIndex, templateId }),
    [runEdit],
  );
  const mirrorSpread = useCallback((spreadIndex: number) => runEdit({ type: "MIRROR_SPREAD", spreadIndex }), [runEdit]);
  const toggleSpreadLock = useCallback(
    (spreadIndex: number, locked: boolean) => runEdit({ type: "SET_SPREAD_LOCK", spreadIndex, locked }),
    [runEdit],
  );
  const insertSpread = useCallback(
    (templateId: string) => {
      if (insertAt === null) return;
      runEdit({ type: "ADD_SPREAD", atIndex: insertAt, templateId, photoIds: [] });
      setInsertAt(null);
    },
    [insertAt, runEdit],
  );

  const spreadsRef = useRef(current?.spreads);
  spreadsRef.current = current?.spreads;
  const feedbackPhotoNumber = useCallback(
    (spreadIndex: number, slotId: string) => {
      const spread = spreadsRef.current?.[spreadIndex];
      const index = spread
        ? (templateById.get(spread.templateId)?.slots.findIndex((slot) => slot.id === slotId) ?? -1)
        : -1;
      return index === -1 ? undefined : index + 1;
    },
    [templateById],
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

  const { cycleDesign } = layouts;
  const runShuffle = useCallback((spreadIndex: number) => cycleDesign(spreadIndex, 1), [cycleDesign]);

  // The layout mutations change identity every render; memoised children get stable wrappers.
  const addPhotoRef = useRef(layouts.addPhoto.mutate);
  addPhotoRef.current = layouts.addPhoto.mutate;
  const removePhotoRef = useRef(layouts.removePhoto.mutate);
  removePhotoRef.current = layouts.removePhoto.mutate;
  const movePhotoRef = useRef(layouts.movePhoto.mutate);
  movePhotoRef.current = layouts.movePhoto.mutate;

  const armAddToSpread = useCallback((spreadIndex: number) => {
    setSelected(null);
    setAddingToSpread((current) => (current === spreadIndex ? null : spreadIndex));
  }, []);
  // Dragging a tray photo straight onto a spread's margins goes through the
  // exact same mutation as the click-to-add flow — just a second, more direct
  // way to reach it, with no arming step required first.
  const addPhotoDrop = useCallback(
    (spreadIndex: number, photoId: string) => addPhotoRef.current({ spreadIndex, photoId }),
    [],
  );
  const removePhoto = useCallback(
    (spreadIndex: number, slotId: string) => removePhotoRef.current({ spreadIndex, slotId }),
    [],
  );
  // A photo dragged in from another spread and dropped on the margins, not
  // onto a slot — grows this spread instead of swapping with anything.
  const movePhotoAsNewPhotoDrop = useCallback(
    (fromSpreadIndex: number, fromSlotId: string, toSpreadIndex: number) =>
      movePhotoRef.current({ fromSpreadIndex, fromSlotId, toSpreadIndex }),
    [],
  );

  // Keeps the slot selected — the tray's click-to-replace then applies to it — and shows
  // the photos that are not in the album yet.
  const { clearFilters } = tray;
  const replacePhoto = useCallback(
    (spreadIndex: number, slotId: string) => {
      setAddingToSpread(null);
      setSelectedText(null);
      setSelected({ spreadIndex, slotId });
      setSidebarTab("photos");
      clearFilters("unused");
    },
    [clearFilters],
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
        runEdit({ type: "SWAP_PHOTO", spreadIndex: slot.spreadIndex, slotId: slot.slotId, photoId });
        setSelected(null);
        return;
      }
      setPicked((prev) => (prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]));
    },
    [runEdit],
  );

  const jumpToSpread = useCallback(
    (spreadIndex: number, slotId?: string) => {
      document.getElementById(`spread-${spreadIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentSpread(spreadIndex);
      if (slotId) {
        setAddingToSpread(null);
        setSelectedText(null);
        setSelected({ spreadIndex, slotId });
      }
    },
    [setCurrentSpread],
  );

  const headerRef = useRef<HTMLElement>(null);
  useHeaderHeightVariable(headerRef, album.data !== undefined);

  useEditorShortcuts(
    {
      currentSpread,
      spreadCount,
      spreads: current?.spreads ?? [],
      selected,
      locked: current?.status === "APPROVED",
      modalOpen: checkOpen || previewOpen || shortcutsOpen || confirmingDelete || insertAt !== null || guides.modalOpen,
    },
    {
      undo: draft.undo,
      redo: draft.redo,
      showShortcuts: () => setShortcutsOpen(true),
      showPreview: () => setPreviewOpen(true),
      showCheck: () => setCheckOpen(true),
      clearSelection: () => {
        setSelected(null);
        setSelectedText(null);
        setAddingToSpread(null);
      },
      jumpToSpread,
      cycleDesign,
      shuffle: runShuffle,
      mirror: mirrorSpread,
      toggleLock: toggleSpreadLock,
      removeSelectedPhoto: () => {
        if (!selected) return;
        removePhoto(selected.spreadIndex, selected.slotId);
        setSelected(null);
      },
    },
  );

  if (album.isLoading) return <p className="page muted">Loading album…</p>;
  if (album.isError) return <p className="page error">{(album.error as Error).message}</p>;
  if (!current) return null;
  const locked = current.status === "APPROVED";
  const aspectRatio = (current.format.pageWidthMm * 2) / current.format.pageHeightMm;
  const historyBusy = draft.restoreSpreads.isPending;

  return (
    <div className="page editor editor--with-strip">
      <GuidedTour id="editor" steps={EDITOR_TOUR} ready={current.spreads.length > 0} />
      <header className="page__header" ref={headerRef}>
        <div>
          <Link to={projectId ? `/projects/${projectId}` : "/"} className="muted back-link">
            {t("album.back")}
          </Link>
          <span className="dimension-badge">
            {t("dimension.chip", { width: current.format.pageWidthMm / 10, height: current.format.pageHeightMm / 10 })}
          </span>
          <h1>{current.title}</h1>
          <p className="muted">
            {t("album.stats", { spreads: current.spreadCount, pages: current.pageCount, photos: current.photoCount })}
          </p>
        </div>
        <EditorToolbar
          saving={saving}
          needsAttention={needsAttention}
          onPreview={() => setPreviewOpen(true)}
          onCheck={() => setCheckOpen(true)}
          onShortcuts={() => setShortcutsOpen(true)}
          locked={locked}
          undo={{ run: draft.undo, disabled: locked || !draft.canUndo || historyBusy }}
          redo={{ run: draft.redo, disabled: locked || !draft.canRedo || historyBusy }}
          showRuler={showRuler}
          onShowRulerChange={setShowRuler}
          snapEnabled={snapEnabled}
          onSnapChange={setSnapEnabled}
          guides={guides}
          status={current.status}
          onReopen={() => draft.edit.mutate({ type: "REOPEN" })}
          onMarkReady={() => draft.edit.mutate({ type: "SUBMIT_FOR_REVIEW" })}
          onDelete={() => setConfirmingDelete(true)}
        />
      </header>

      {draft.edit.isError && <p className="error">{(draft.edit.error as Error).message}</p>}
      {draft.restoreSpreads.isError && <p className="error">{(draft.restoreSpreads.error as Error).message}</p>}
      {locked && (
        <p className="notice">This album is approved and locked. Reopen it if the client asked for another change.</p>
      )}

      <div className={`editor__layout ${tray.prefs.wide ? "editor__layout--wide" : ""}`}>
        <main className="spreads">
          <CoverEditor
            cover={current.cover ?? null}
            albumStyle={current.style ?? DEFAULT_STYLE}
            aspectRatio={current.format.pageWidthMm / current.format.pageHeightMm}
            albumTitle={current.title}
            previewUrlFor={previewUrlFor}
            focusFor={focusFor}
            locked={locked}
            onChange={setCover}
          />
          {current.spreads.map((spread, spreadIndex) => {
            const design = layouts.designPositionOf(spread);
            return (
              <div key={spreadIndex} className="spread-slot-group">
                <SpreadBlock
                  // Keyed by position alone. Including the template id would change the
                  // key whenever the layout changed, remounting the section and forcing
                  // the browser to re-decode every photo on it.
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
                  showGuides={guides.show}
                  safeMarginMm={guides.show ? (guides.selected?.safeMarginMm ?? 0) : 0}
                  snapEnabled={snapEnabled}
                  selectedSlotId={selected?.spreadIndex === spreadIndex ? selected.slotId : null}
                  locked={locked}
                  shuffling={layouts.shuffle.isPending}
                  designIndex={design.index}
                  designTotal={design.total}
                  addingPhoto={addingToSpread === spreadIndex}
                  addPhotoDisabled={spread.placements.length >= MAX_PHOTOS_PER_SPREAD}
                  openComments={commentsBySpread.get(spreadIndex) ?? 0}
                  onSelectSlot={selectSlot}
                  onReorder={reorderSpread}
                  onResetFrames={resetFrames}
                  onCycleDesign={cycleDesign}
                  onAddPhoto={armAddToSpread}
                  onSpreadTreatment={setSpreadTreatment}
                  onRemove={removeSpread}
                  onSlotDrop={dropPhotoInSlot}
                  onCropChange={draft.changeCrop}
                  onTreatmentChange={setSlotTreatment}
                  onFrameChange={draft.changeFrame}
                  onFramesChange={draft.changeFrames}
                  onMirror={mirrorSpread}
                  onToggleLock={toggleSpreadLock}
                  chapterLabel={chapters[spreadIndex] ? t(`chapter.${chapters[spreadIndex]}`) : undefined}
                  onReorderPlacement={reorderPlacement}
                  onMoveToNeighbor={moveToNeighbor}
                  onMovePlacementAcrossSpreads={movePlacementAcrossSpreads}
                  onMovePhotoAsNewPhoto={movePhotoAsNewPhotoDrop}
                  onPickTemplate={pickTemplate}
                  onAddPhotoDrop={addPhotoDrop}
                  onRemovePhoto={removePhoto}
                  onReplacePhoto={replacePhoto}
                  onCloseTools={closeTools}
                  albumStyle={current.style ?? DEFAULT_STYLE}
                  selectedTextId={selectedText?.spreadIndex === spreadIndex ? selectedText.blockId : null}
                  onAddText={addText}
                  onTextSelect={selectText}
                  onTextChange={draft.changeText}
                  onTextRemove={removeText}
                  focusFor={focusFor}
                />

                {!locked && (
                  <button
                    type="button"
                    className="spread-insert"
                    title={t("spread.insert.title")}
                    aria-label={t("spread.insert.title")}
                    onClick={() => setInsertAt(spreadIndex + 1)}
                  >
                    +
                  </button>
                )}
              </div>
            );
          })}

          {!locked && (
            <button type="button" className="button add-spread" onClick={() => setInsertAt(current.spreads.length)}>
              {t("album.addSpread")}
            </button>
          )}
        </main>

        <aside className="sidebar">
          <div
            className="sidebar__tabs"
            role="tablist"
            aria-label={t("album.sidebar.label")}
            data-tour="editor-sidebar"
          >
            {(
              [
                ["photos", t("album.sidebar.photos"), 0],
                ["design", t("album.sidebar.design"), 0],
                ["review", t("album.sidebar.review"), feedback.data?.openCount ?? 0],
                ["export", t("album.sidebar.export"), 0],
              ] as [SidebarTab, string, number][]
            ).map(([tab, label, badge]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={sidebarTab === tab}
                className={`sidebar__tab ${sidebarTab === tab ? "sidebar__tab--on" : ""}`}
                onClick={() => setSidebarTab(tab)}
              >
                {label}
                {badge > 0 && <span className="sidebar__badge">{badge}</span>}
              </button>
            ))}
          </div>
          <section className={`panel ${sidebarTab === "design" ? "" : "is-hidden"}`}>
            <div className="panel__head">
              <h2>{t("style.title")}</h2>
            </div>
            <StylePanel style={current.style ?? DEFAULT_STYLE} locked={locked} onChange={setStyle} />
          </section>
          <TrayPanel
            tray={tray}
            hidden={sidebarTab !== "photos"}
            locked={locked}
            addingToSpread={addingToSpread}
            selectedSpread={selected?.spreadIndex ?? null}
            picked={picked}
            onClearPicked={() => setPicked([])}
            onAddPicked={() => layouts.addAsSpread.mutate(picked, { onSuccess: () => setPicked([]) })}
            addingPicked={layouts.addAsSpread.isPending}
            errors={[
              layouts.addAsSpread,
              layouts.shuffle,
              layouts.addPhoto,
              layouts.removePhoto,
              layouts.movePhoto,
            ].map((mutation) => (mutation.isError ? (mutation.error as Error) : null))}
            onPhotoClick={trayPhotoClick}
            analysisByPhoto={analysisByPhoto}
            rankedCount={analyses.data?.length ?? 0}
            usedPhotoIds={usedPhotoIds}
            clientPickedIds={clientPickedIds}
          />
          <ReviewPanel albumId={albumId} hidden={sidebarTab !== "review"} />
          <FeedbackPanel
            albumId={albumId}
            feedback={feedback}
            hidden={sidebarTab !== "review"}
            onJumpTo={jumpToComment}
            photoNumber={feedbackPhotoNumber}
          />
          <ExportPanel albumId={albumId} hidden={sidebarTab !== "export"} />
        </aside>
      </div>

      <PageStrip
        spreads={current.spreads}
        templateById={templateById}
        thumbnailUrlFor={thumbnailUrlFor}
        albumStyle={current.style ?? DEFAULT_STYLE}
        aspectRatio={aspectRatio}
        currentIndex={currentSpread}
        locked={locked}
        openCommentsBySpread={commentsBySpread}
        issuesBySpread={issueCounts}
        chapters={chapters}
        onJump={jumpToSpread}
        onReorder={reorderSpread}
        onDropPhoto={addPhotoDrop}
      />

      {checkOpen && (
        <AlbumCheckPanel
          issues={issues}
          thumbnailUrlFor={thumbnailUrlFor}
          onJump={jumpToSpread}
          onShowUnused={() => {
            setSidebarTab("photos");
            tray.setShow("unused");
            tray.setSort("score");
          }}
          onClose={() => setCheckOpen(false)}
        />
      )}
      {previewOpen && (
        <BookPreview
          album={{ ...current, style: current.style ?? DEFAULT_STYLE }}
          templateById={templateById}
          previewUrlFor={previewUrlFor}
          focusFor={focusFor}
          startAt={currentSpread}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}

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
            <h2 id="delete-album-title">{t("album.deleteAlbum.title")}</h2>
            <p>{t("album.deleteAlbum.body", { title: current.title })}</p>
            {removeAlbum.isError && <p className="error">{(removeAlbum.error as Error).message}</p>}
            <div className="modal__actions">
              <button
                type="button"
                className="button"
                disabled={removeAlbum.isPending}
                onClick={() => setConfirmingDelete(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={removeAlbum.isPending}
                onClick={() => removeAlbum.mutate()}
              >
                {removeAlbum.isPending ? t("album.deleteAlbum.deleting") : t("album.deleteAlbum")}
              </button>
            </div>
          </div>
        </div>
      )}

      {insertAt !== null && (
        <InsertSpreadModal templates={templateList} onPick={insertSpread} onClose={() => setInsertAt(null)} />
      )}
      {guides.modalOpen && <PrintGuidesModal guides={guides} />}
    </div>
  );
}
