import { memo, useCallback, useState } from "react";
import type {
  AlbumDTO,
  AlbumStyleDTO,
  Crop,
  LayoutTemplateDTO,
  PhotoFocus,
  PhotoTreatment,
  SlotFrame,
  TextBlockDTO,
} from "@albumflow/contracts";
import { SpreadCanvas } from "@/shared/album/SpreadCanvas";
import { LayoutPicker } from "./LayoutPicker";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { tip } from "@/shared/lib/tip";

type Spread = AlbumDTO["spreads"][number];

export interface SpreadBlockProps {
  spread: Spread;
  spreadIndex: number;
  spreadCount: number;
  template: LayoutTemplateDTO | undefined;
  templates: LayoutTemplateDTO[];
  previewUrlFor: (photoId: string) => string | null | undefined;
  aspectRatio: number;
  pageWidthMm: number;
  pageHeightMm: number;
  showRuler: boolean;
  showGuides: boolean;
  safeMarginMm: number;
  snapEnabled: boolean;
  selectedSlotId: string | null;
  locked: boolean;
  shuffling: boolean;
  /** Where the current layout sits among the ones ranked for these photos; null until they are known. */
  designIndex: number | null;
  designTotal: number | null;
  /** True while this spread is armed to receive the next tray photo clicked. */
  addingPhoto: boolean;
  /** True once this spread is already at the largest layout the catalogue offers. */
  addPhotoDisabled: boolean;
  /** Unresolved client notes pointing at this spread. */
  openComments: number;
  onSelectSlot: (spreadIndex: number, slotId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onResetFrames: (spreadIndex: number) => void;
  /** Steps to the previous (-1) or next (1) layout ranked for this spread's photos. */
  onCycleDesign: (spreadIndex: number, step: 1 | -1) => void;
  onAddPhoto: (spreadIndex: number) => void;
  onSpreadTreatment: (spreadIndex: number, treatment: PhotoTreatment) => void;
  onRemove: (spreadIndex: number) => void;
  onSlotDrop: (spreadIndex: number, slotId: string, photoId: string) => void;
  onCropChange: (spreadIndex: number, slotId: string, crop: Crop, commit: boolean) => void;
  onTreatmentChange: (spreadIndex: number, slotId: string, treatment: PhotoTreatment) => void;
  onFrameChange: (spreadIndex: number, slotId: string, frame: SlotFrame, commit: boolean) => void;
  onFramesChange: (spreadIndex: number, frames: { slotId: string; frame: SlotFrame }[], commit: boolean) => void;
  onMirror: (spreadIndex: number) => void;
  onToggleLock: (spreadIndex: number, locked: boolean) => void;
  /** The chapter this spread opens, shown above it; absent when it continues the one before. */
  chapterLabel?: string | undefined;
  onReorderPlacement: (spreadIndex: number, fromSlotId: string, toSlotId: string) => void;
  onMoveToNeighbor: (spreadIndex: number, fromSlotId: string, toSlotId: string) => void;
  /** A photo dragged in from a different spread, dropped onto a slot here. */
  onMovePlacementAcrossSpreads: (
    fromSpreadIndex: number,
    fromSlotId: string,
    toSpreadIndex: number,
    toSlotId: string,
  ) => void;
  /**
   * A photo dragged in from a different spread, dropped on the margins here
   * rather than onto a slot — grows this spread by one instead of swapping.
   */
  onMovePhotoAsNewPhoto: (
    fromSpreadIndex: number,
    fromSlotId: string,
    toSpreadIndex: number,
  ) => void;
  onPickTemplate: (spreadIndex: number, templateId: string) => void;
  /** A tray photo dropped on the margins/gutter, not a specific slot — grows the spread. */
  onAddPhotoDrop: (spreadIndex: number, photoId: string) => void;
  onRemovePhoto: (spreadIndex: number, slotId: string) => void;
  /** Opens the tray on unused photos; the next one clicked replaces this slot's photo. */
  onReplacePhoto: (spreadIndex: number, slotId: string) => void;
  /** Deselects the photo, which closes its floating tools. */
  onCloseTools: () => void;
  albumStyle: AlbumStyleDTO;
  selectedTextId: string | null;
  onAddText: (spreadIndex: number) => void;
  onTextSelect: (spreadIndex: number, blockId: string) => void;
  onTextChange: (spreadIndex: number, block: TextBlockDTO, commit: boolean) => void;
  onTextRemove: (spreadIndex: number, blockId: string) => void;
  focusFor: (photoId: string) => PhotoFocus | null | undefined;
}

/**
 * One spread, memoised. The editor holds the whole album in state, so without this
 * boundary every crop drag frame re-renders all twenty-odd spreads — and each one
 * carries images the browser then has to re-rasterise.
 */
export const SpreadBlock = memo(function SpreadBlock({
  spread,
  spreadIndex,
  spreadCount,
  template,
  templates,
  previewUrlFor,
  aspectRatio,
  pageWidthMm,
  pageHeightMm,
  showRuler,
  showGuides,
  safeMarginMm,
  snapEnabled,
  selectedSlotId,
  locked,
  shuffling,
  designIndex,
  designTotal,
  addingPhoto,
  addPhotoDisabled,
  openComments,
  onSelectSlot,
  onReorder,
  onResetFrames,
  onCycleDesign,
  onAddPhoto,
  onSpreadTreatment,
  onRemove,
  onSlotDrop,
  onCropChange,
  onTreatmentChange,
  onFrameChange,
  onFramesChange,
  onMirror,
  onToggleLock,
  chapterLabel,
  onReorderPlacement,
  onMoveToNeighbor,
  onMovePlacementAcrossSpreads,
  onMovePhotoAsNewPhoto,
  onPickTemplate,
  onAddPhotoDrop,
  onRemovePhoto,
  onReplacePhoto,
  onCloseTools,
  albumStyle,
  selectedTextId,
  onAddText,
  onTextSelect,
  onTextChange,
  onTextRemove,
  focusFor,
}: SpreadBlockProps) {
  const { t } = useLanguage();
  // Each handler binds this spread's index once, so SpreadCanvas sees stable props.
  const selectSlot = useCallback(
    (slotId: string) => onSelectSlot(spreadIndex, slotId),
    [onSelectSlot, spreadIndex],
  );
  const slotDrop = useCallback(
    (slotId: string, photoId: string) => onSlotDrop(spreadIndex, slotId, photoId),
    [onSlotDrop, spreadIndex],
  );
  const cropChange = useCallback(
    (slotId: string, crop: Crop, commit: boolean) =>
      onCropChange(spreadIndex, slotId, crop, commit),
    [onCropChange, spreadIndex],
  );
  const treatmentChange = useCallback(
    (slotId: string, treatment: PhotoTreatment) =>
      onTreatmentChange(spreadIndex, slotId, treatment),
    [onTreatmentChange, spreadIndex],
  );
  const frameChange = useCallback(
    (slotId: string, frame: SlotFrame, commit: boolean) =>
      onFrameChange(spreadIndex, slotId, frame, commit),
    [onFrameChange, spreadIndex],
  );
  const framesChange = useCallback(
    (frames: { slotId: string; frame: SlotFrame }[], commit: boolean) => onFramesChange(spreadIndex, frames, commit),
    [onFramesChange, spreadIndex],
  );
  const reorderPlacement = useCallback(
    (fromSlotId: string, toSlotId: string) =>
      onReorderPlacement(spreadIndex, fromSlotId, toSlotId),
    [onReorderPlacement, spreadIndex],
  );
  const moveToNeighbor = useCallback(
    (fromSlotId: string, toSlotId: string) =>
      onMoveToNeighbor(spreadIndex, fromSlotId, toSlotId),
    [onMoveToNeighbor, spreadIndex],
  );
  const movePlacementAcrossSpreads = useCallback(
    (fromSpreadIndex: number, fromSlotId: string, toSlotId: string) =>
      onMovePlacementAcrossSpreads(fromSpreadIndex, fromSlotId, spreadIndex, toSlotId),
    [onMovePlacementAcrossSpreads, spreadIndex],
  );
  const movePhotoAsNewPhoto = useCallback(
    (fromSpreadIndex: number, fromSlotId: string) =>
      onMovePhotoAsNewPhoto(fromSpreadIndex, fromSlotId, spreadIndex),
    [onMovePhotoAsNewPhoto, spreadIndex],
  );
  const pickTemplate = useCallback(
    (templateId: string) => onPickTemplate(spreadIndex, templateId),
    [onPickTemplate, spreadIndex],
  );
  const addPhoto = useCallback(() => onAddPhoto(spreadIndex), [onAddPhoto, spreadIndex]);
  const addPhotoDrop = useCallback(
    (photoId: string) => onAddPhotoDrop(spreadIndex, photoId),
    [onAddPhotoDrop, spreadIndex],
  );
  const removePhoto = useCallback(
    (slotId: string) => onRemovePhoto(spreadIndex, slotId),
    [onRemovePhoto, spreadIndex],
  );

  const replacePhoto = useCallback(
    (slotId: string) => onReplacePhoto(spreadIndex, slotId),
    [onReplacePhoto, spreadIndex],
  );
  // The selected photo's tools render into this bar, above the spread, instead of over the photos.
  const [toolsHost, setToolsHost] = useState<HTMLDivElement | null>(null);

  const textSelect = useCallback(
    (blockId: string) => onTextSelect(spreadIndex, blockId),
    [onTextSelect, spreadIndex],
  );
  const textChange = useCallback(
    (block: TextBlockDTO, commit: boolean) => onTextChange(spreadIndex, block, commit),
    [onTextChange, spreadIndex],
  );
  const textRemove = useCallback(
    (blockId: string) => onTextRemove(spreadIndex, blockId),
    [onTextRemove, spreadIndex],
  );

  const mono = spreadIsMono(spread.placements);
  // A locked spread keeps its layout: photos can still be framed, nothing else moves.
  const layoutLocked = locked || Boolean(spread.locked);
  // The slot-tools bar now renders just below its slot rather than over it —
  // but `.spread-block` carries `content-visibility: auto` for scroll
  // performance, which unconditionally applies paint containment (it clips
  // descendants to the box exactly like `overflow: hidden`, on top of
  // whatever `.spread` itself does) regardless of whether the block is
  // on-screen. That silently hid the bar the moment it fell outside the
  // block's own padding box, so containment is switched off for the one
  // spread currently being edited.
  const selectedPlacement = spread.placements.find(
    (placement) => placement.slotId === selectedSlotId,
  );
  const toolsOpen =
    !locked && (Boolean(selectedPlacement && previewUrlFor(selectedPlacement.photoId)) || selectedTextId !== null);

  return (
    <section
      className={`spread-block ${addingPhoto ? "spread-block--adding" : ""} ${
        toolsOpen ? "spread-block--tools-open" : ""
      }`}
      id={`spread-${spreadIndex}`}
      data-spread-index={spreadIndex}
    >
      {chapterLabel && <p className="spread-block__chapter">{chapterLabel}</p>}
      <div className="spread-block__head">
        <h2>
          {t("spread.heading", { number: spreadIndex + 1 })}
          {spread.locked && (
            <span className="spread-block__lock" title={t("spread.lock.badge")} aria-label={t("spread.lock.badge")}>
              🔒
            </span>
          )}
          {openComments > 0 && (
            <span
              className="spread-block__comments"
              title={t("spread.comments", {
                count: openComments,
                plural: openComments === 1 ? "" : "s",
              })}
            >
              {openComments}
            </span>
          )}
        </h2>
        <div className="spread-block__actions" data-tour={spreadIndex === 0 ? "editor-spread-actions" : undefined}>
          <button
            type="button"
            className="button button--small"
            disabled={locked || spreadIndex === 0}
            onClick={() => onReorder(spreadIndex, spreadIndex - 1)}
            {...below(t("tip.moveUp"))}
          >
            {t("spread.moveUp")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked || spreadIndex === spreadCount - 1}
            onClick={() => onReorder(spreadIndex, spreadIndex + 1)}
            {...below(t("tip.moveDown"))}
          >
            {t("spread.moveDown")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={layoutLocked || !spreadHasCustomFrames(spread.placements)}
            {...below(t("spread.resetLayout.title"))}
            onClick={() => onResetFrames(spreadIndex)}
          >
            {t("spread.resetLayout")}
          </button>
          <div className="design-switch" role="group" aria-label={t("spread.design.group")}>
            <button
              type="button"
              className="button button--small design-switch__arrow"
              disabled={layoutLocked || shuffling}
              aria-label={t("spread.design.prev")}
              {...below(t("spread.design.prev.title"))}
              onClick={() => onCycleDesign(spreadIndex, -1)}
            >
              ‹
            </button>
            <span className="design-switch__label" aria-live="polite">
              {designTotal === null
                ? t("spread.design.label")
                : designIndex === null
                  ? t("spread.design.count", { total: designTotal })
                  : t("spread.design.position", { index: designIndex + 1, total: designTotal })}
            </span>
            <button
              type="button"
              className="button button--small design-switch__arrow"
              disabled={layoutLocked || shuffling}
              aria-label={t("spread.design.next")}
              {...below(t("spread.design.next.title"))}
              onClick={() => onCycleDesign(spreadIndex, 1)}
            >
              ›
            </button>
          </div>
          <button
            type="button"
            className={`button button--small ${addingPhoto ? "button--primary" : ""}`}
            disabled={layoutLocked || (addPhotoDisabled && !addingPhoto)}
            {...below(
              addingPhoto
                ? t("spread.addPhoto.title.adding")
                : addPhotoDisabled
                  ? t("spread.addPhoto.title.disabled")
                  : t("spread.addPhoto.title.ready"),
            )}
            onClick={addPhoto}
          >
            {addingPhoto ? t("spread.addPhoto.clickPhoto") : t("spread.addPhoto")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked}
            {...below(t("spread.addText.title"))}
            onClick={() => onAddText(spreadIndex)}
          >
            {t("spread.addText")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked}
            {...below(t("spread.treatment.title"))}
            onClick={() => onSpreadTreatment(spreadIndex, mono ? "COLOR" : "BLACK_WHITE")}
          >
            {mono ? t("spread.treatment.color") : t("spread.treatment.bw")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={layoutLocked}
            {...below(t("spread.mirror.title"))}
            onClick={() => onMirror(spreadIndex)}
          >
            {t("spread.mirror")}
          </button>
          <button
            type="button"
            className={`button button--small ${spread.locked ? "button--primary" : ""}`}
            disabled={locked}
            aria-pressed={Boolean(spread.locked)}
            {...below(spread.locked ? t("spread.unlock.title") : t("spread.lock.title"))}
            onClick={() => onToggleLock(spreadIndex, !spread.locked)}
          >
            {spread.locked ? t("spread.unlock") : t("spread.lock")}
          </button>
          <button
            type="button"
            className="button button--small button--danger"
            disabled={locked || spreadCount === 1}
            onClick={() => onRemove(spreadIndex)}
            {...below(t("tip.removeSpread"))}
          >
            {t("spread.remove")}
          </button>
        </div>
      </div>

      <div ref={setToolsHost} className="spread-block__toolbar" />
      <div data-tour={spreadIndex === 0 ? "editor-spread" : undefined}>
      <SpreadCanvas
        spreadIndex={spreadIndex}
        template={template}
        placements={spread.placements}
        previewUrlFor={previewUrlFor}
        aspectRatio={aspectRatio}
        pageWidthMm={pageWidthMm}
        pageHeightMm={pageHeightMm}
        showRuler={showRuler}
        showGuides={showGuides}
        safeMarginMm={safeMarginMm}
        snapEnabled={snapEnabled}
        selectedSlotId={selectedSlotId}
        onSlotClick={locked ? undefined : selectSlot}
        onSlotDrop={locked ? undefined : slotDrop}
        onCropChange={locked ? undefined : cropChange}
        onTreatmentChange={locked ? undefined : treatmentChange}
        onFrameChange={layoutLocked ? undefined : frameChange}
        onFramesChange={layoutLocked ? undefined : framesChange}
        onReorderPlacement={locked ? undefined : reorderPlacement}
        onMoveToNeighbor={locked ? undefined : moveToNeighbor}
        onMovePlacementAcrossSpreads={locked ? undefined : movePlacementAcrossSpreads}
        onMovePhotoAsNewPhoto={layoutLocked ? undefined : movePhotoAsNewPhoto}
        onAddPhotoDrop={layoutLocked ? undefined : addPhotoDrop}
        onRemovePhoto={layoutLocked ? undefined : removePhoto}
        onCloseTools={locked ? undefined : onCloseTools}
        onReplacePhoto={locked ? undefined : replacePhoto}
        toolsHost={toolsHost}
        albumStyle={albumStyle}
        texts={spread.texts}
        selectedTextId={selectedTextId}
        onTextSelect={locked ? undefined : textSelect}
        onTextChange={locked ? undefined : textChange}
        onTextRemove={locked ? undefined : textRemove}
        focusFor={focusFor}
      />
      </div>

      <div data-tour={spreadIndex === 0 ? "editor-layouts" : undefined}>
      <LayoutPicker
        templates={templates}
        photoCount={spread.placements.length}
        currentTemplateId={spread.templateId}
        disabled={layoutLocked}
        onPick={pickTemplate}
      />
      </div>
    </section>
  );
});

function spreadIsMono(placements: { treatment?: PhotoTreatment | undefined }[]): boolean {
  return placements.length > 0 && placements.every((p) => p.treatment === "BLACK_WHITE");
}

function spreadHasCustomFrames(placements: { frame?: unknown }[]): boolean {
  return placements.some((placement) => placement.frame !== undefined);
}

/**
 * A hint shown under the control rather than over it: `.spread-block` uses paint
 * containment (for scroll performance), which would clip a hint above its top edge.
 */
function below(text: string): Record<string, string> {
  return { ...tip(text), "data-tip-pos": "below" };
}
