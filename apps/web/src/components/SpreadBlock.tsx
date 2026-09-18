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
  onPickTemplate: (spreadIndex: number, templateId: string) => void;
  /** A tray photo dropped on the margins/gutter, not a specific slot — grows the spread. */
  onAddPhotoDrop: (spreadIndex: number, photoId: string) => void;
  onRemovePhoto: (spreadIndex: number, slotId: string) => void;
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
  onPickTemplate,
  onAddPhotoDrop,
  onRemovePhoto,
}: SpreadBlockProps) {
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

  return (
    <section
      className={`spread-block ${addingPhoto ? "spread-block--adding" : ""}`}
      id={`spread-${spreadIndex}`}
    >
      <div className="spread-block__head">
        <h2>
          Spread {spreadIndex + 1}
          {openComments > 0 && (
            <span
              className="spread-block__comments"
              title={`${openComments} client note${openComments === 1 ? "" : "s"} on this spread`}
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
            ↑
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked || spreadIndex === spreadCount - 1}
            onClick={() => onReorder(spreadIndex, spreadIndex + 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked || !spreadHasCustomFrames(spread.placements)}
            title="Put every photo back where the template had it"
            onClick={() => onResetFrames(spreadIndex)}
          >
            Reset layout
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked || shuffling}
            title="Try the next layout that fits these photos"
            onClick={() => onShuffle(spreadIndex)}
          >
            Shuffle design
          </button>
          <button
            type="button"
            className={`button button--small ${addingPhoto ? "button--primary" : ""}`}
            disabled={locked || (addPhotoDisabled && !addingPhoto)}
            title={
              addingPhoto
                ? "Click a photo in the tray to add it here"
                : addPhotoDisabled
                  ? "This spread already holds as many photos as any layout supports"
                  : "Pick a photo from the tray to add to this spread"
            }
            onClick={addPhoto}
          >
            {addingPhoto ? "Click a photo…" : "+ Add photo"}
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={locked}
            title="Toggle black and white for the whole spread"
            onClick={() => onSpreadTreatment(spreadIndex, mono ? "COLOR" : "BLACK_WHITE")}
          >
            {mono ? "Colour" : "B&W"}
          </button>
          <button
            type="button"
            className="button button--small button--danger"
            disabled={locked || spreadCount === 1}
            onClick={() => onRemove(spreadIndex)}
          >
            Remove
          </button>
        </div>
      </div>

      <SpreadCanvas
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
        onAddPhotoDrop={locked ? undefined : addPhotoDrop}
        onRemovePhoto={locked ? undefined : removePhoto}
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
