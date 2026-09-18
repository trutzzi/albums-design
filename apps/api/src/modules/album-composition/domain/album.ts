import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import { findTemplate, type LayoutTemplate } from "./layout-template";

export type AlbumStatus = "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "EXPORTED";

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

/** A darkroom decision, not a filter stack — photographers want one honest choice here. */
export type PhotoTreatment = "COLOR" | "BLACK_WHITE";

/**
 * An override of the template slot's own rectangle, in spread coordinates. Absent
 * means "whatever the template says", which is what keeps a spread snapping back
 * cleanly when the photographer resets it or picks a different layout.
 */
export interface SlotFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_FRAME_SIZE = 0.05;

export interface Placement {
  slotId: string;
  photoId: string;
  crop: Crop;
  treatment: PhotoTreatment;
  frame?: SlotFrame;
}

export interface Spread {
  templateId: string;
  placements: Placement[];
}

export interface AlbumFormat {
  pageWidthMm: number;
  pageHeightMm: number;
  bleedMm: number;
}

export const DEFAULT_FORMAT: AlbumFormat = { pageWidthMm: 300, pageHeightMm: 300, bleedMm: 3 };

export interface AlbumProps {
  projectId: UniqueEntityId;
  title: string;
  status: AlbumStatus;
  format: AlbumFormat;
  spreads: Spread[];
  createdAt: Date;
  updatedAt: Date;
}

export class AlbumLockedError extends Error {
  constructor(status: AlbumStatus) {
    super(`An album in ${status} cannot be edited. Reopen it first.`);
    this.name = "AlbumLockedError";
  }
}

export class SpreadNotFoundError extends Error {
  constructor(index: number) {
    super(`Spread ${index} does not exist in this album.`);
    this.name = "SpreadNotFoundError";
  }
}

export class SlotNotFoundError extends Error {
  constructor(slotId: string, templateId: string) {
    super(`Slot ${slotId} does not exist in template ${templateId}.`);
    this.name = "SlotNotFoundError";
  }
}

export class Album extends AggregateRoot<AlbumProps> {
  private constructor(props: AlbumProps, id: UniqueEntityId) {
    super(props, id);
  }

  static create(
    params: {
      projectId: UniqueEntityId;
      title: string;
      spreads: Spread[];
      format?: AlbumFormat;
    },
    id?: UniqueEntityId,
  ): Album {
    const now = new Date();
    return new Album(
      {
        projectId: params.projectId,
        title: params.title,
        status: "DRAFT",
        format: params.format ?? DEFAULT_FORMAT,
        spreads: params.spreads,
        createdAt: now,
        updatedAt: now,
      },
      id ?? UniqueEntityId.create(),
    );
  }

  static reconstitute(props: AlbumProps, id: UniqueEntityId): Album {
    return new Album(props, id);
  }

  get projectId(): UniqueEntityId {
    return this.props.projectId;
  }

  get title(): string {
    return this.props.title;
  }

  get status(): AlbumStatus {
    return this.props.status;
  }

  get format(): AlbumFormat {
    return this.props.format;
  }

  get spreads(): readonly Spread[] {
    return this.props.spreads;
  }

  get spreadCount(): number {
    return this.props.spreads.length;
  }

  /** Physical leaves of paper: one spread is two facing pages. */
  get pageCount(): number {
    return this.props.spreads.length * 2;
  }

  get photoCount(): number {
    return this.props.spreads.reduce((sum, spread) => sum + spread.placements.length, 0);
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  rename(title: string): void {
    this.assertEditable();
    this.props.title = title;
    this.touch();
  }

  reorderSpread(fromIndex: number, toIndex: number): void {
    this.assertEditable();
    this.assertSpreadExists(fromIndex);
    if (toIndex < 0 || toIndex >= this.props.spreads.length) throw new SpreadNotFoundError(toIndex);
    const [moved] = this.props.spreads.splice(fromIndex, 1);
    if (moved) this.props.spreads.splice(toIndex, 0, moved);
    this.touch();
  }

  swapPhoto(spreadIndex: number, slotId: string, photoId: string): void {
    this.assertEditable();
    const spread = this.spreadAt(spreadIndex);
    const placement = spread.placements.find((candidate) => candidate.slotId === slotId);
    if (!placement) throw new SlotNotFoundError(slotId, spread.templateId);
    placement.photoId = photoId;
    // The crop belonged to the old photo, but the treatment is a decision about how
    // this spread should look, so it survives the swap.
    placement.crop = { ...FULL_CROP };
    this.touch();
  }

  setTreatment(spreadIndex: number, slotId: string, treatment: PhotoTreatment): void {
    this.assertEditable();
    const spread = this.spreadAt(spreadIndex);
    const placement = spread.placements.find((candidate) => candidate.slotId === slotId);
    if (!placement) throw new SlotNotFoundError(slotId, spread.templateId);
    placement.treatment = treatment;
    this.touch();
  }

  /** Applies one treatment to every photo on the spread — the common case for B&W. */
  setSpreadTreatment(spreadIndex: number, treatment: PhotoTreatment): void {
    this.assertEditable();
    const spread = this.spreadAt(spreadIndex);
    for (const placement of spread.placements) placement.treatment = treatment;
    this.touch();
  }

  /** The two photos trade places entirely — framing and treatment travel with them. */
  swapPlacements(spreadIndex: number, slotIdA: string, slotIdB: string): void {
    this.assertEditable();
    if (slotIdA === slotIdB) return;
    const spread = this.spreadAt(spreadIndex);
    const a = spread.placements.find((candidate) => candidate.slotId === slotIdA);
    const b = spread.placements.find((candidate) => candidate.slotId === slotIdB);
    if (!a) throw new SlotNotFoundError(slotIdA, spread.templateId);
    if (!b) throw new SlotNotFoundError(slotIdB, spread.templateId);

    const carried = { photoId: a.photoId, crop: a.crop, treatment: a.treatment };
    a.photoId = b.photoId;
    a.crop = b.crop;
    a.treatment = b.treatment;
    b.photoId = carried.photoId;
    b.crop = carried.crop;
    b.treatment = carried.treatment;
    this.touch();
  }

  /**
   * The cross-spread counterpart to swapPlacements: exchanges the photo at
   * `fromSlotId` on one spread with whatever occupies `toSlotId` on another,
   * so dragging a photo across spreads never discards the one it lands on.
   * Framing and treatment travel with each photo; slot rectangles never move.
   */
  movePlacementAcrossSpreads(
    fromSpreadIndex: number,
    fromSlotId: string,
    toSpreadIndex: number,
    toSlotId: string,
  ): void {
    this.assertEditable();
    if (fromSpreadIndex === toSpreadIndex && fromSlotId === toSlotId) return;
    const fromSpread = this.spreadAt(fromSpreadIndex);
    const toSpread = this.spreadAt(toSpreadIndex);
    const a = fromSpread.placements.find((candidate) => candidate.slotId === fromSlotId);
    const b = toSpread.placements.find((candidate) => candidate.slotId === toSlotId);
    if (!a) throw new SlotNotFoundError(fromSlotId, fromSpread.templateId);
    if (!b) throw new SlotNotFoundError(toSlotId, toSpread.templateId);

    const carried = { photoId: a.photoId, crop: a.crop, treatment: a.treatment };
    a.photoId = b.photoId;
    a.crop = b.crop;
    a.treatment = b.treatment;
    b.photoId = carried.photoId;
    b.crop = carried.crop;
    b.treatment = carried.treatment;
    this.touch();
  }

  /**
   * Moves the photo at `fromSlotId` to sit exactly where `toSlotId` is in the
   * spread's reading order — every placement between the two shifts over by
   * one to fill the gap, rather than the two simply trading places. Framing
   * and treatment travel with the photo, same as swapPlacements. Slot
   * rectangles never move: only which photo occupies which slot changes.
   */
  reorderPlacement(spreadIndex: number, fromSlotId: string, toSlotId: string): void {
    this.assertEditable();
    if (fromSlotId === toSlotId) return;
    const spread = this.spreadAt(spreadIndex);
    const fromIndex = spread.placements.findIndex((candidate) => candidate.slotId === fromSlotId);
    const toIndex = spread.placements.findIndex((candidate) => candidate.slotId === toSlotId);
    if (fromIndex === -1) throw new SlotNotFoundError(fromSlotId, spread.templateId);
    if (toIndex === -1) throw new SlotNotFoundError(toSlotId, spread.templateId);

    const cargo = spread.placements.map((placement) => ({
      photoId: placement.photoId,
      crop: placement.crop,
      treatment: placement.treatment,
    }));
    const moved = cargo[fromIndex]!;
    if (fromIndex < toIndex) {
      for (let index = fromIndex; index < toIndex; index++) cargo[index] = cargo[index + 1]!;
    } else {
      for (let index = fromIndex; index > toIndex; index--) cargo[index] = cargo[index - 1]!;
    }
    cargo[toIndex] = moved;

    spread.placements.forEach((placement, index) => {
      const item = cargo[index]!;
      placement.photoId = item.photoId;
      placement.crop = item.crop;
      placement.treatment = item.treatment;
    });
    this.touch();
  }

  setFrame(spreadIndex: number, slotId: string, frame: SlotFrame): void {
    this.assertEditable();
    const spread = this.spreadAt(spreadIndex);
    const placement = spread.placements.find((candidate) => candidate.slotId === slotId);
    if (!placement) throw new SlotNotFoundError(slotId, spread.templateId);
    placement.frame = normaliseFrame(frame);
    this.touch();
  }

  /** Drops every hand-adjusted rectangle on the spread, back to the template's own. */
  resetFrames(spreadIndex: number): void {
    this.assertEditable();
    const spread = this.spreadAt(spreadIndex);
    for (const placement of spread.placements) delete placement.frame;
    this.touch();
  }

  setCrop(spreadIndex: number, slotId: string, crop: Crop): void {
    this.assertEditable();
    const spread = this.spreadAt(spreadIndex);
    const placement = spread.placements.find((candidate) => candidate.slotId === slotId);
    if (!placement) throw new SlotNotFoundError(slotId, spread.templateId);
    placement.crop = normaliseCrop(crop);
    this.touch();
  }

  /**
   * Keeps as many photos as the new template has room for, in reading order, so a
   * template change never silently drops the photographer's selection.
   */
  changeTemplate(spreadIndex: number, templateId: string, photoOrder?: string[]): void {
    this.assertEditable();
    const spread = this.spreadAt(spreadIndex);
    const template = findTemplate(templateId);
    if (!template) throw new Error(`Unknown layout template ${templateId}.`);

    const treatmentOf = new Map(
      spread.placements.map((placement) => [placement.photoId, placement.treatment]),
    );
    const carried = (photoOrder ?? spread.placements.map((placement) => placement.photoId)).map(
      (photoId) => ({ photoId, treatment: treatmentOf.get(photoId) ?? "COLOR" }),
    );
    const last = carried[carried.length - 1];
    spread.templateId = templateId;
    // Frames are deliberately not carried: they described the old template's slots.
    spread.placements = template.slots.map((slot, index) => ({
      slotId: slot.id,
      photoId: carried[index]?.photoId ?? last?.photoId ?? "",
      crop: { ...FULL_CROP },
      treatment: carried[index]?.treatment ?? last?.treatment ?? "COLOR",
    }));
    this.touch();
  }

  addSpread(atIndex: number, template: LayoutTemplate, photoIds: string[]): void {
    this.assertEditable();
    const index = Math.min(Math.max(atIndex, 0), this.props.spreads.length);
    this.props.spreads.splice(index, 0, {
      templateId: template.id,
      placements: template.slots.map((slot, slotIndex) => ({
        slotId: slot.id,
        photoId: photoIds[slotIndex] ?? "",
        crop: { ...FULL_CROP },
        treatment: "COLOR" as PhotoTreatment,
      })),
    });
    this.touch();
  }

  removeSpread(index: number): void {
    this.assertEditable();
    this.assertSpreadExists(index);
    if (this.props.spreads.length === 1) {
      throw new Error("An album must keep at least one spread.");
    }
    this.props.spreads.splice(index, 1);
    this.touch();
  }

  /**
   * Replaces every spread wholesale — how undo/redo jump the album back to an
   * earlier or later snapshot. Bypasses the narrower, single-purpose edits
   * above because a history restore is inherently a bulk operation: the
   * client is handing back a full spreads array it already received from a
   * previous successful edit, not describing a targeted change.
   */
  restoreSpreads(spreads: Spread[]): void {
    this.assertEditable();
    if (spreads.length === 0) throw new Error("An album must keep at least one spread.");
    this.props.spreads = spreads;
    this.touch();
  }

  submitForReview(): void {
    if (this.props.status === "APPROVED") throw new AlbumLockedError(this.props.status);
    this.props.status = "IN_REVIEW";
    this.touch();
  }

  recordChangesRequested(): void {
    this.props.status = "CHANGES_REQUESTED";
    this.touch();
  }

  approve(): void {
    this.props.status = "APPROVED";
    this.touch();
  }

  reopen(): void {
    this.props.status = "DRAFT";
    this.touch();
  }

  markExported(): void {
    this.props.status = "EXPORTED";
    this.touch();
  }

  private spreadAt(index: number): Spread {
    this.assertSpreadExists(index);
    return this.props.spreads[index] as Spread;
  }

  private assertSpreadExists(index: number): void {
    if (index < 0 || index >= this.props.spreads.length) throw new SpreadNotFoundError(index);
  }

  private assertEditable(): void {
    if (this.props.status === "APPROVED") throw new AlbumLockedError(this.props.status);
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}

export function normaliseFrame(frame: SlotFrame): SlotFrame {
  const width = Math.min(1, Math.max(MIN_FRAME_SIZE, frame.width));
  const height = Math.min(1, Math.max(MIN_FRAME_SIZE, frame.height));
  return {
    width,
    height,
    x: Math.min(1 - width, Math.max(0, frame.x)),
    y: Math.min(1 - height, Math.max(0, frame.y)),
  };
}

function normaliseCrop(crop: Crop): Crop {
  const width = Math.min(1, Math.max(0.05, crop.width));
  const height = Math.min(1, Math.max(0.05, crop.height));
  return {
    width,
    height,
    x: Math.min(1 - width, Math.max(0, crop.x)),
    y: Math.min(1 - height, Math.max(0, crop.y)),
  };
}
