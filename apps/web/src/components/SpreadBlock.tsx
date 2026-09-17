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
  selectedSlotId: string | null;
  locked: boolean;
  shuffling: boolean;
  /** Unresolved client notes pointing at this spread. */
  openComments: number;
  onSelectSlot: (spreadIndex: number, slotId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onResetFrames: (spreadIndex: number) => void;
  onShuffle: (spreadIndex: number) => void;
  onSpreadTreatment: (spreadIndex: number, treatment: PhotoTreatment) => void;
  onRemove: (spreadIndex: number) => void;
  onSlotDrop: (spreadIndex: number, slotId: string, photoId: string) => void;
  onCropChange: (spreadIndex: number, slotId: string, crop: Crop, commit: boolean) => void;
  onTreatmentChange: (spreadIndex: number, slotId: string, treatment: PhotoTreatment) => void;
  onFrameChange: (spreadIndex: number, slotId: string, frame: SlotFrame, commit: boolean) => void;
  onSwapSlots: (spreadIndex: number, slotIdA: string, slotIdB: string) => void;
  onPickTemplate: (spreadIndex: number, templateId: string) => void;
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
  selectedSlotId,
  locked,
  shuffling,
  openComments,
  onSelectSlot,
  onReorder,
  onResetFrames,
  onShuffle,
  onSpreadTreatment,
  onRemove,
  onSlotDrop,
  onCropChange,
  onTreatmentChange,
  onFrameChange,
  onSwapSlots,
  onPickTemplate,
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
  const swapSlots = useCallback(
    (slotIdA: string, slotIdB: string) => onSwapSlots(spreadIndex, slotIdA, slotIdB),
    [onSwapSlots, spreadIndex],
  );
  const pickTemplate = useCallback(
    (templateId: string) => onPickTemplate(spreadIndex, templateId),
    [onPickTemplate, spreadIndex],
  );

  const mono = spreadIsMono(spread.placements);

  return (
    <section className="spread-block" id={`spread-${spreadIndex}`}>
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
        selectedSlotId={selectedSlotId}
        onSlotClick={locked ? undefined : selectSlot}
        onSlotDrop={locked ? undefined : slotDrop}
        onCropChange={locked ? undefined : cropChange}
        onTreatmentChange={locked ? undefined : treatmentChange}
        onFrameChange={locked ? undefined : frameChange}
        onSwapSlots={locked ? undefined : swapSlots}
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
