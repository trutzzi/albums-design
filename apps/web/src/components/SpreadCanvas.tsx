import { memo, useCallback, useMemo, useRef, useState } from "react";
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
import {
  RESIZE_CORNERS,
  collectPrintGuideTargets,
  collectSnapTargets,
  edgeDirectionFromPoint,
  mergeSnapTargets,
  nearestNeighborInDirection,
  resizeFrame,
  resizeFrameSnapped,
  type ResizeCorner,
} from "../lib/frame-geometry";
import { RulerOverlay } from "./RulerOverlay";
import { PrintGuidesOverlay } from "./PrintGuidesOverlay";
import { useLanguage } from "../lib/i18n/LanguageContext";

export interface SpreadPlacement {
  slotId: string;
  photoId: string;
  crop?: Crop | undefined;
  treatment?: PhotoTreatment | undefined;
  frame?: SlotFrame | undefined;
}

export interface SpreadCanvasProps {
  /** This spread's own position in the album — stamped onto a drag so a drop
   * elsewhere can tell whether a photo crossed spreads. */
  spreadIndex: number;
  template: LayoutTemplateDTO | undefined;
  placements: SpreadPlacement[];
  previewUrlFor: (photoId: string) => string | null | undefined;
  /** Width ÷ height of the whole spread. */
  aspectRatio: number;
  /** Real-world dimensions of the whole spread, in millimetres — for the ruler. */
  pageWidthMm: number;
  pageHeightMm: number;
  /** Renders a centimetre grid beneath the photos, for checking alignment. */
  showRuler?: boolean | undefined;
  /** Renders the trim line and the print profile's safe area, per page. */
  showGuides?: boolean | undefined;
  /** Safe area inset from trim, in millimetres — from the selected print profile. */
  safeMarginMm?: number | undefined;
  /** Snaps a dragged corner to page edges/centre and other slots' edges. Defaults to on. */
  snapEnabled?: boolean | undefined;
  selectedSlotId?: string | null | undefined;
  onSlotClick?: ((slotId: string) => void) | undefined;
  onSlotDrop?: ((slotId: string, photoId: string) => void) | undefined;
  /** Fires continuously while dragging; `commit` marks the gesture as finished. */
  onCropChange?: ((slotId: string, crop: Crop, commit: boolean) => void) | undefined;
  onTreatmentChange?: ((slotId: string, treatment: PhotoTreatment) => void) | undefined;
  /** Live while dragging a corner; `commit` marks the gesture finished. */
  onFrameChange?: ((slotId: string, frame: SlotFrame, commit: boolean) => void) | undefined;
  /**
   * Dragging a filled slot onto another one moves it there — every placement
   * between the two shifts over by one, rather than the two trading places.
   */
  onReorderPlacement?: ((fromSlotId: string, toSlotId: string) => void) | undefined;
  /**
   * A filled slot's photo dragged toward the left/right/top/bottom edge of the
   * spread itself, rather than dropped onto another slot — swaps it with
   * whichever slot sits immediately in that direction.
   */
  onMoveToNeighbor?: ((fromSlotId: string, toSlotId: string) => void) | undefined;
  /**
   * A photo dragged in from a DIFFERENT spread and dropped onto `toSlotId` —
   * swaps it with whatever already sits there, so nothing is lost either side.
   */
  onMovePlacementAcrossSpreads?:
    | ((fromSpreadIndex: number, fromSlotId: string, toSlotId: string) => void)
    | undefined;
  /**
   * A photo dragged in from a DIFFERENT spread and dropped on the margins —
   * not onto any slot — grows this spread by one instead of swapping.
   */
  onMovePhotoAsNewPhoto?: ((fromSpreadIndex: number, fromSlotId: string) => void) | undefined;
  /**
   * A tray photo dropped somewhere that isn't a specific slot — the margins,
   * the gutter — grows the spread instead of replacing anything. Lets a photo
   * be added even once the layout is already full, with no slot free to swap.
   */
  onAddPhotoDrop?: ((photoId: string) => void) | undefined;
  /** Removes one photo from the spread outright, not just clears its slot. */
  onRemovePhoto?: ((slotId: string) => void) | undefined;
}

const DEFAULT_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Memoised: the editor re-renders on every crop drag frame, and re-rendering a
 * canvas means React touches every <img> on it.
 */
export const SpreadCanvas = memo(function SpreadCanvas({
  spreadIndex,
  template,
  placements,
  previewUrlFor,
  aspectRatio,
  pageWidthMm,
  pageHeightMm,
  showRuler,
  showGuides,
  safeMarginMm = 0,
  snapEnabled = true,
  selectedSlotId,
  onSlotClick,
  onSlotDrop,
  onCropChange,
  onTreatmentChange,
  onFrameChange,
  onReorderPlacement,
  onMoveToNeighbor,
  onMovePlacementAcrossSpreads,
  onMovePhotoAsNewPhoto,
  onAddPhotoDrop,
  onRemovePhoto,
}: SpreadCanvasProps) {
  const { t } = useLanguage();
  // Natural aspect per photo, learned on load — the crop maths needs it.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  // Highlights the whole spread (as opposed to one slot) while a tray photo is
  // dragged over the margins/gutter — the target for growing the spread.
  const [spreadDropActive, setSpreadDropActive] = useState(false);
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

  // Every slot's current on-screen rectangle — a hand-resized frame if it has
  // one, the template's own otherwise — recomputed only when the shapes that
  // matter actually change. This is the reference set a corner drag snaps
  // against, so it has to reflect what is genuinely on screen right now, not
  // just the original template.
  const allRects = useMemo(() => {
    if (!template) return [];
    return template.slots.map((slot) => {
      const placement = placements.find((candidate) => candidate.slotId === slot.id);
      return { slotId: slot.id, rect: placement?.frame ?? slot };
    });
  }, [template, placements]);

  if (!template) return <div className="spread spread--missing">{t("spread.unknownLayout")}</div>;

  // Whether the floating slot-tools bar will render below this render pass —
  // decided here, not inside the slot loop, so the spread container can widen
  // its own overflow to fit a toolbar sitting just past a bottom-row slot's edge.
  const selectedPlacement = placements.find((candidate) => candidate.slotId === selectedSlotId);
  const toolsOpen = Boolean(
    onCropChange && selectedPlacement && previewUrlFor(selectedPlacement.photoId),
  );

  return (
    <div
      ref={spreadRef}
      className={`spread ${spreadDropActive ? "spread--drop-active" : ""} ${
        toolsOpen ? "spread--tools-open" : ""
      }`}
      style={{ aspectRatio: String(aspectRatio) }}
      onDragOver={
        onAddPhotoDrop || onMoveToNeighbor || onMovePhotoAsNewPhoto
          ? (event) => {
              // A slot under the pointer handles its own drop and calls
              // stopPropagation there — this only ever fires for the margins,
              // the gutter, or a slot with no drop handler of its own.
              event.preventDefault();
              setSpreadDropActive(true);
            }
          : undefined
      }
      onDragLeave={(event) => {
        if (event.target === event.currentTarget) setSpreadDropActive(false);
      }}
      onDrop={
        onAddPhotoDrop || onMoveToNeighbor || onMovePhotoAsNewPhoto
          ? (event) => {
              event.preventDefault();
              setSpreadDropActive(false);
              // An existing slot's photo dragged toward an edge moves it that
              // direction within the same spread; dragged in from a
              // different spread and dropped here on the margins, it joins
              // this spread as a new photo instead. A bare photo id means
              // the tray is growing the spread.
              const fromSlot = event.dataTransfer.getData("text/slot-id");
              const fromSpreadRaw = event.dataTransfer.getData("text/spread-index");
              const fromSpreadIndex = fromSpreadRaw === "" ? spreadIndex : Number(fromSpreadRaw);
              if (fromSlot && fromSpreadIndex !== spreadIndex) {
                onMovePhotoAsNewPhoto?.(fromSpreadIndex, fromSlot);
                return;
              }
              if (fromSlot && onMoveToNeighbor && fromSpreadIndex === spreadIndex) {
                const bounds = event.currentTarget.getBoundingClientRect();
                const nx = (event.clientX - bounds.left) / bounds.width;
                const ny = (event.clientY - bounds.top) / bounds.height;
                const direction = edgeDirectionFromPoint(nx, ny);
                const neighbor = nearestNeighborInDirection(allRects, fromSlot, direction);
                if (neighbor) onMoveToNeighbor(fromSlot, neighbor);
                return;
              }
              const photoId = event.dataTransfer.getData("text/photo-id");
              if (photoId) onAddPhotoDrop?.(photoId);
            }
          : undefined
      }
    >
      <div className="spread__gutter" aria-hidden="true" />
      {showRuler && <RulerOverlay widthMm={pageWidthMm * 2} heightMm={pageHeightMm} />}
      {showGuides && (
        <PrintGuidesOverlay
          pageWidthMm={pageWidthMm}
          pageHeightMm={pageHeightMm}
          safeMarginMm={safeMarginMm}
        />
      )}
      {/* Filled in during the loop below for the one selected+editable slot, then
          rendered last — as a sibling of the slots, not nested inside one — so
          `.slot`'s `overflow: hidden` (needed to clip the photo crop) can never
          clip the controls themselves, no matter how small that slot is. */}
      {(() => {
        let toolsOverlay: React.ReactNode = null;
        const slotElements = template.slots.map((slot) => {
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

        const slotElement = (
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
            draggable={
              Boolean(
                onReorderPlacement ||
                  onMoveToNeighbor ||
                  onMovePlacementAcrossSpreads ||
                  onMovePhotoAsNewPhoto,
              ) &&
              !editable &&
              Boolean(placement?.photoId)
            }
            onDragStart={(event) => {
              event.dataTransfer.setData("text/slot-id", slot.id);
              event.dataTransfer.setData("text/spread-index", String(spreadIndex));
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDropTarget(null)}
            onDragOver={
              onSlotDrop || onReorderPlacement || onMovePlacementAcrossSpreads
                ? (event) => {
                    event.preventDefault();
                    setDropTarget(slot.id);
                  }
                : undefined
            }
            onDragLeave={() => setDropTarget((prev) => (prev === slot.id ? null : prev))}
            onDrop={(event) => {
              event.preventDefault();
              // Landing on a slot is handled here, fully — it must not also
              // bubble up to the spread-level "add" handler below, or one drop
              // would both replace this slot's photo and add a second one.
              event.stopPropagation();
              setDropTarget(null);
              // A slot id means a photo already on this spread — or another one —
              // is being dragged to a new position; a photo id means the tray is
              // replacing whatever was here.
              const fromSlot = event.dataTransfer.getData("text/slot-id");
              if (fromSlot) {
                const fromSpreadRaw = event.dataTransfer.getData("text/spread-index");
                const fromSpreadIndex = fromSpreadRaw === "" ? spreadIndex : Number(fromSpreadRaw);
                if (fromSpreadIndex !== spreadIndex) {
                  onMovePlacementAcrossSpreads?.(fromSpreadIndex, fromSlot, slot.id);
                  return;
                }
                if (fromSlot !== slot.id) {
                  onReorderPlacement?.(fromSlot, slot.id);
                  return;
                }
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
              <span className="slot__empty">{t(`spread.slot.${slot.prefers.toLowerCase()}`)}</span>
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
                    const dx = (event.clientX - resize.startX) / bounds.width;
                    const dy = (event.clientY - resize.startY) / bounds.height;
                    const nextFrame = snapEnabled
                      ? resizeFrameSnapped(
                          resize.frame,
                          resize.corner,
                          dx,
                          dy,
                          mergeSnapTargets(
                            collectSnapTargets(
                              allRects
                                .filter((entry) => entry.slotId !== slot.id)
                                .map((entry) => entry.rect),
                            ),
                            showGuides
                              ? collectPrintGuideTargets(pageWidthMm, pageHeightMm, safeMarginMm)
                              : { x: [], y: [] },
                          ),
                        )
                      : resizeFrame(resize.frame, resize.corner, dx, dy);
                    onFrameChange(slot.id, nextFrame, false);
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
          </div>
        );

        if (editable && url) {
          toolsOverlay = (
            <div
              key="slot-tools-overlay"
              className="slot-tools-anchor"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
            >
              <div className="slot-tools" onClick={(event) => event.stopPropagation()}>
                <input
                  id={`zoom-${slot.id}`}
                  className="slot-tools__zoom"
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.02}
                  value={imageAspect !== undefined ? zoomOf(crop, imageAspect, slotAspect) : 1}
                  aria-label={t("spread.zoom")}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => applyZoom(Number(event.target.value), false)}
                  onPointerUp={(event) =>
                    applyZoom(Number((event.target as HTMLInputElement).value), true)
                  }
                />
                <button
                  type="button"
                  className={`slot-tools__button ${treatment === "BLACK_WHITE" ? "is-active" : ""}`}
                  title={t("spread.bwToggle.title")}
                  onClick={() =>
                    onTreatmentChange?.(
                      slot.id,
                      treatment === "BLACK_WHITE" ? "COLOR" : "BLACK_WHITE",
                    )
                  }
                >
                  {t("spread.treatment.bw")}
                </button>
                <button
                  type="button"
                  className="slot-tools__button"
                  title={t("spread.resetFraming.title")}
                  onClick={() =>
                    imageAspect !== undefined &&
                    onCropChange?.(slot.id, baseCrop(imageAspect, slotAspect), true)
                  }
                >
                  {t("spread.resetFraming")}
                </button>
                {onRemovePhoto && (
                  <button
                    type="button"
                    className="slot-tools__button slot-tools__button--danger"
                    title={
                      placements.length > 1
                        ? t("spread.removePhoto.title.canRemove")
                        : t("spread.removePhoto.title.lastPhoto")
                    }
                    disabled={placements.length <= 1}
                    onClick={() => onRemovePhoto(slot.id)}
                  >
                    {t("spread.removePhoto")}
                  </button>
                )}
              </div>
            </div>
          );
        }

        return slotElement;
      });

      return (
        <>
          {slotElements}
          {toolsOverlay}
        </>
      );
    })()}
    </div>
  );
});

/** An untouched placement still carries the full-frame default; snap it to the slot shape. */
function normalise(crop: Crop, imageAspect: number, slotAspect: number): Crop {
  const isUntouched = crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
  return isUntouched ? baseCrop(imageAspect, slotAspect) : crop;
}
