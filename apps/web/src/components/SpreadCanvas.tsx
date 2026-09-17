import { memo, useCallback, useRef, useState } from "react";
import type { Crop, LayoutTemplateDTO, PhotoTreatment, SlotFrame } from "@albumflow/contracts";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  baseCrop,
  cropToStyle,
  pannedCrop,
  withZoom,
  zoomOf,
} from "../lib/crop-geometry";
import { RESIZE_CORNERS, resizeFrame, type ResizeCorner } from "../lib/frame-geometry";

export interface SpreadPlacement {
  slotId: string;
  photoId: string;
  crop?: Crop | undefined;
  treatment?: PhotoTreatment | undefined;
  frame?: SlotFrame | undefined;
}

export interface SpreadCanvasProps {
  template: LayoutTemplateDTO | undefined;
  placements: SpreadPlacement[];
  previewUrlFor: (photoId: string) => string | null | undefined;
  /** Width ÷ height of the whole spread. */
  aspectRatio: number;
  selectedSlotId?: string | null | undefined;
  onSlotClick?: ((slotId: string) => void) | undefined;
  onSlotDrop?: ((slotId: string, photoId: string) => void) | undefined;
  /** Fires continuously while dragging; `commit` marks the gesture as finished. */
  onCropChange?: ((slotId: string, crop: Crop, commit: boolean) => void) | undefined;
  onTreatmentChange?: ((slotId: string, treatment: PhotoTreatment) => void) | undefined;
  /** Live while dragging a corner; `commit` marks the gesture finished. */
  onFrameChange?: ((slotId: string, frame: SlotFrame, commit: boolean) => void) | undefined;
  /** Two photos on this spread trade places. */
  onSwapSlots?: ((slotIdA: string, slotIdB: string) => void) | undefined;
}

const DEFAULT_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Memoised: the editor re-renders on every crop drag frame, and re-rendering a
 * canvas means React touches every <img> on it.
 */
export const SpreadCanvas = memo(function SpreadCanvas({
  template,
  placements,
  previewUrlFor,
  aspectRatio,
  selectedSlotId,
  onSlotClick,
  onSlotDrop,
  onCropChange,
  onTreatmentChange,
  onFrameChange,
  onSwapSlots,
}: SpreadCanvasProps) {
  // Natural aspect per photo, learned on load — the crop maths needs it.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const dragRef = useRef<{ slotId: string; startX: number; startY: number; crop: Crop } | null>(
    null,
  );
  const spreadRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    slotId: string;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    frame: SlotFrame;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const rememberAspect = useCallback((photoId: string, width: number, height: number) => {
    if (!width || !height) return;
    setAspects((prev) =>
      prev[photoId] === width / height ? prev : { ...prev, [photoId]: width / height },
    );
  }, []);

  if (!template) return <div className="spread spread--missing">Unknown layout</div>;

  return (
    <div ref={spreadRef} className="spread" style={{ aspectRatio: String(aspectRatio) }}>
      <div className="spread__gutter" aria-hidden="true" />
      {template.slots.map((slot) => {
        const placement = placements.find((candidate) => candidate.slotId === slot.id);
        const url = placement ? previewUrlFor(placement.photoId) : null;
        const selected = selectedSlotId === slot.id;
        const editable = Boolean(onCropChange) && selected;
        const interactive = Boolean(onSlotClick || onSlotDrop);

        const rect = placement?.frame ?? slot;
        const slotAspect = (rect.width * aspectRatio) / rect.height;
        const imageAspect = placement ? aspects[placement.photoId] : undefined;
        const crop = placement?.crop ?? DEFAULT_CROP;
        const treatment = placement?.treatment ?? "COLOR";

        const style =
          imageAspect !== undefined ? cropToStyle(crop, imageAspect, slotAspect) : undefined;

        const beginDrag = (event: React.PointerEvent) => {
          if (!editable || !placement || imageAspect === undefined) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            slotId: slot.id,
            startX: event.clientX,
            startY: event.clientY,
            crop: normalise(crop, imageAspect, slotAspect),
          };
        };

        const moveDrag = (event: React.PointerEvent) => {
          const drag = dragRef.current;
          if (!drag || drag.slotId !== slot.id || imageAspect === undefined) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const next = pannedCrop(
            drag.crop,
            (event.clientX - drag.startX) / bounds.width,
            (event.clientY - drag.startY) / bounds.height,
            imageAspect,
            slotAspect,
          );
          onCropChange?.(slot.id, next, false);
        };

        const endDrag = (event: React.PointerEvent) => {
          if (!dragRef.current || dragRef.current.slotId !== slot.id) return;
          dragRef.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          if (placement?.crop) onCropChange?.(slot.id, placement.crop, true);
        };

        const applyZoom = (zoom: number, commit: boolean) => {
          if (imageAspect === undefined) return;
          const from = normalise(crop, imageAspect, slotAspect);
          onCropChange?.(slot.id, withZoom(from, zoom, imageAspect, slotAspect), commit);
        };

        return (
          <div
            key={slot.id}
            className={[
              "slot",
              selected ? "slot--selected" : "",
              interactive ? "slot--interactive" : "",
              editable ? "slot--editable" : "",
              dropTarget === slot.id ? "slot--drop-target" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
            onClick={onSlotClick ? () => onSlotClick(slot.id) : undefined}
            draggable={Boolean(onSwapSlots) && !editable && Boolean(placement?.photoId)}
            onDragStart={(event) => {
              event.dataTransfer.setData("text/slot-id", slot.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDropTarget(null)}
            onDragOver={
              onSlotDrop || onSwapSlots
                ? (event) => {
                    event.preventDefault();
                    setDropTarget(slot.id);
                  }
                : undefined
            }
            onDragLeave={() => setDropTarget((prev) => (prev === slot.id ? null : prev))}
            onDrop={(event) => {
              event.preventDefault();
              setDropTarget(null);
              // A slot id means two photos on this spread trade places; a photo id
              // means the tray is replacing whatever was here.
              const fromSlot = event.dataTransfer.getData("text/slot-id");
              if (fromSlot && fromSlot !== slot.id) {
                onSwapSlots?.(fromSlot, slot.id);
                return;
              }
              const photoId = event.dataTransfer.getData("text/photo-id");
              if (photoId) onSlotDrop?.(slot.id, photoId);
            }}
            onPointerDown={editable ? beginDrag : undefined}
            onPointerMove={editable ? moveDrag : undefined}
            onPointerUp={editable ? endDrag : undefined}
            onPointerCancel={editable ? endDrag : undefined}
            onWheel={
              editable
                ? (event) => {
                    if (imageAspect === undefined) return;
                    const current = zoomOf(crop, imageAspect, slotAspect);
                    applyZoom(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12), true);
                  }
                : undefined
            }
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={
              onSlotClick
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSlotClick(slot.id);
                    }
                  }
                : undefined
            }
          >
            {url ? (
              <img
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className={treatment === "BLACK_WHITE" ? "is-monochrome" : undefined}
                style={style}
                onLoad={(event) =>
                  placement &&
                  rememberAspect(
                    placement.photoId,
                    event.currentTarget.naturalWidth,
                    event.currentTarget.naturalHeight,
                  )
                }
              />
            ) : (
              <span className="slot__empty">{slot.prefers.toLowerCase()}</span>
            )}

            {editable &&
              onFrameChange &&
              RESIZE_CORNERS.map((corner) => (
                <span
                  key={corner}
                  className={`slot-handle slot-handle--${corner}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    resizeRef.current = {
                      slotId: slot.id,
                      corner,
                      startX: event.clientX,
                      startY: event.clientY,
                      frame: { ...rect },
                    };
                  }}
                  onPointerMove={(event) => {
                    const resize = resizeRef.current;
                    const bounds = spreadRef.current?.getBoundingClientRect();
                    if (!resize || resize.slotId !== slot.id || !bounds) return;
                    event.stopPropagation();
                    onFrameChange(
                      slot.id,
                      resizeFrame(
                        resize.frame,
                        resize.corner,
                        (event.clientX - resize.startX) / bounds.width,
                        (event.clientY - resize.startY) / bounds.height,
                      ),
                      false,
                    );
                  }}
                  onPointerUp={(event) => {
                    if (resizeRef.current?.slotId !== slot.id) return;
                    event.stopPropagation();
                    resizeRef.current = null;
                    onFrameChange(slot.id, rect, true);
                  }}
                  onPointerCancel={() => {
                    resizeRef.current = null;
                  }}
                />
              ))}

            {editable && url && (
              <div className="slot-tools" onClick={(event) => event.stopPropagation()}>
                <input
                  id={`zoom-${slot.id}`}
                  className="slot-tools__zoom"
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.02}
                  value={imageAspect !== undefined ? zoomOf(crop, imageAspect, slotAspect) : 1}
                  aria-label="Zoom"
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => applyZoom(Number(event.target.value), false)}
                  onPointerUp={(event) =>
                    applyZoom(Number((event.target as HTMLInputElement).value), true)
                  }
                />
                <button
                  type="button"
                  className={`slot-tools__button ${treatment === "BLACK_WHITE" ? "is-active" : ""}`}
                  title="Black and white"
                  onClick={() =>
                    onTreatmentChange?.(
                      slot.id,
                      treatment === "BLACK_WHITE" ? "COLOR" : "BLACK_WHITE",
                    )
                  }
                >
                  B&amp;W
                </button>
                <button
                  type="button"
                  className="slot-tools__button"
                  title="Reset framing"
                  onClick={() =>
                    imageAspect !== undefined &&
                    onCropChange?.(slot.id, baseCrop(imageAspect, slotAspect), true)
                  }
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

/** An untouched placement still carries the full-frame default; snap it to the slot shape. */
function normalise(crop: Crop, imageAspect: number, slotAspect: number): Crop {
  const isUntouched = crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
  return isUntouched ? baseCrop(imageAspect, slotAspect) : crop;
}
