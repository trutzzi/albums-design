import { memo, useCallback } from "react";
import type {
  AlbumDTO,
  Crop,
  LayoutTemplateDTO,
  PhotoTreatment,
  SlotFrame,
} from "@albumflow/contracts";
import { SpreadCanvas } from "./SpreadCanvas";
import { LayoutPicker } from "./LayoutPicker";
import { useLanguage } from "../lib/i18n/LanguageContext";

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
  /** True while this spread is armed to receive the next tray photo clicked. */
  addingPhoto: boolean;
  /** True once this spread is already at the largest layout the catalogue offers. */
  addPhotoDisabled: boolean;
  /** Unresolved client notes pointing at this spread. */
  openComments: number;
  onSelectSlot: (spreadIndex: number, slotId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onResetFrames: (spreadIndex: number) => void;
  onShuffle: (spreadIndex: number) => void;
  onAddPhoto: (spreadIndex: number) => void;
  onSpreadTreatment: (spreadIndex: number, treatment: PhotoTreatment) => void;
  onRemove: (spreadIndex: number) => void;
  onSlotDrop: (spreadIndex: number, slotId: string, photoId: string) => void;
  onCropChange: (spreadIndex: number, slotId: string, crop: Crop, commit: boolean) => void;
  onTreatmentChange: (spreadIndex: number, slotId: string, treatment: PhotoTreatment) => void;
  onFrameChange: (spreadIndex: number, slotId: string, frame: SlotFrame, commit: boolean) => void;
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
  /** Deselects the photo, which closes its floating tools. */
  onCloseTools: () => void;
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
  addingPhoto,
  addPhotoDisabled,
  openComments,
  onSelectSlot,
  onReorder,
  onResetFrames,
  onShuffle,
  onAddPhoto,
  onSpreadTreatment,
  onRemove,
  onSlotDrop,
  onCropChange,
  onTreatmentChange,
  onFrameChange,
  onReorderPlacement,
  onMoveToNeighbor,
  onMovePlacementAcrossSpreads,
  onMovePhotoAsNewPhoto,
  onPickTemplate,
  onAddPhotoDrop,
  onRemovePhoto,
  onCloseTools,
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

  const mono = spreadIsMono(spread.placements);
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
  const toolsOpen = !locked && Boolean(selectedPlacement && previewUrlFor(selectedPlacement.photoId));

  return (
    <section
      className={`spread-block ${addingPhoto ? "spread-block--adding" : ""} ${
        toolsOpen ? "spread-block--tools-open" : ""
      }`}
      id={`spread-${spreadIndex}`}
    >
      <div className="spread-block__head">
        <h2>
          {t("spread.heading", { number: spreadIndex + 1 })}
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
        <div className="spread-block__actions">
          <button
            type="button"
            className="button button--small"
            disabled={locked || spreadIndex === 0}
            onClick={() => onReorder(spreadIndex, spreadIndex - 1)}
          >
            {t("spread.moveUp")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked || spreadIndex === spreadCount - 1}
            onClick={() => onReorder(spreadIndex, spreadIndex + 1)}
          >
            {t("spread.moveDown")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked || !spreadHasCustomFrames(spread.placements)}
            title={t("spread.resetLayout.title")}
            onClick={() => onResetFrames(spreadIndex)}
          >
            {t("spread.resetLayout")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked || shuffling}
            title={t("spread.shuffle.title")}
            onClick={() => onShuffle(spreadIndex)}
          >
            {t("spread.shuffle")}
          </button>
          <button
            type="button"
            className={`button button--small ${addingPhoto ? "button--primary" : ""}`}
            disabled={locked || (addPhotoDisabled && !addingPhoto)}
            title={
              addingPhoto
                ? t("spread.addPhoto.title.adding")
                : addPhotoDisabled
                  ? t("spread.addPhoto.title.disabled")
                  : t("spread.addPhoto.title.ready")
            }
            onClick={addPhoto}
          >
            {addingPhoto ? t("spread.addPhoto.clickPhoto") : t("spread.addPhoto")}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked}
            title={t("spread.treatment.title")}
            onClick={() => onSpreadTreatment(spreadIndex, mono ? "COLOR" : "BLACK_WHITE")}
          >
            {mono ? t("spread.treatment.color") : t("spread.treatment.bw")}
          </button>
          <button
            type="button"
            className="button button--small button--danger"
            disabled={locked || spreadCount === 1}
            onClick={() => onRemove(spreadIndex)}
          >
            {t("spread.remove")}
          </button>
        </div>
      </div>

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
        onFrameChange={locked ? undefined : frameChange}
        onReorderPlacement={locked ? undefined : reorderPlacement}
        onMoveToNeighbor={locked ? undefined : moveToNeighbor}
        onMovePlacementAcrossSpreads={locked ? undefined : movePlacementAcrossSpreads}
        onMovePhotoAsNewPhoto={locked ? undefined : movePhotoAsNewPhoto}
        onAddPhotoDrop={locked ? undefined : addPhotoDrop}
        onRemovePhoto={locked ? undefined : removePhoto}
        onCloseTools={locked ? undefined : onCloseTools}
      />

      <LayoutPicker
        templates={templates}
        photoCount={spread.placements.length}
        currentTemplateId={spread.templateId}
        disabled={locked}
        onPick={pickTemplate}
      />
    </section>
  );
});

function spreadIsMono(placements: { treatment?: PhotoTreatment | undefined }[]): boolean {
  return placements.length > 0 && placements.every((p) => p.treatment === "BLACK_WHITE");
}

function spreadHasCustomFrames(placements: { frame?: unknown }[]): boolean {
  return placements.some((placement) => placement.frame !== undefined);
}
