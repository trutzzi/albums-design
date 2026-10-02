import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ConflictError, NotFoundError, ValidationError, type ApplicationError } from "#src/shared-kernel/errors";
import type { AlbumCoverDTO, AlbumStyleDTO, SpreadDTO, TextBlockDTO } from "@albumflow/contracts";
import {
  Album,
  AlbumLockedError,
  type Crop,
  type PhotoTreatment,
  type SlotFrame,
  SpreadLockedError,
} from "#src/modules/album-composition/domain/album";
import type { AlbumRepository } from "#src/modules/album-composition/domain/album-repository";
import { findTemplate } from "#src/modules/album-composition/domain/layout-template";

export type AlbumEditCommand =
  | { type: "RENAME"; title: string }
  | { type: "REORDER_SPREAD"; fromIndex: number; toIndex: number }
  | { type: "SWAP_PHOTO"; spreadIndex: number; slotId: string; photoId: string }
  | { type: "SET_CROP"; spreadIndex: number; slotId: string; crop: Crop }
  | { type: "SWAP_PLACEMENTS"; spreadIndex: number; slotIdA: string; slotIdB: string }
  | { type: "REORDER_PLACEMENT"; spreadIndex: number; fromSlotId: string; toSlotId: string }
  | {
      type: "MOVE_PLACEMENT_ACROSS_SPREADS";
      fromSpreadIndex: number;
      fromSlotId: string;
      toSpreadIndex: number;
      toSlotId: string;
    }
  | { type: "SET_FRAME"; spreadIndex: number; slotId: string; frame: SlotFrame }
  | { type: "RESET_FRAMES"; spreadIndex: number }
  | { type: "SET_FRAMES"; spreadIndex: number; frames: { slotId: string; frame: SlotFrame }[] }
  | { type: "MIRROR_SPREAD"; spreadIndex: number }
  | { type: "SET_SPREAD_LOCK"; spreadIndex: number; locked: boolean }
  | { type: "RESTORE_SPREADS"; spreads: SpreadDTO[] }
  | { type: "SET_TREATMENT"; spreadIndex: number; slotId: string; treatment: PhotoTreatment }
  | { type: "SET_SPREAD_TREATMENT"; spreadIndex: number; treatment: PhotoTreatment }
  | { type: "CHANGE_TEMPLATE"; spreadIndex: number; templateId: string; photoIds?: string[] | undefined }
  | { type: "ADD_SPREAD"; atIndex: number; templateId: string; photoIds: string[] }
  | { type: "REMOVE_SPREAD"; index: number }
  | { type: "SET_TEXT_BLOCK"; spreadIndex: number; block: TextBlockDTO }
  | { type: "REMOVE_TEXT_BLOCK"; spreadIndex: number; blockId: string }
  | { type: "SET_STYLE"; style: AlbumStyleDTO }
  | { type: "SET_COVER"; cover: AlbumCoverDTO | null }
  | { type: "SUBMIT_FOR_REVIEW" }
  | { type: "REOPEN" };

export class EditAlbumUseCase {
  constructor(private readonly albums: AlbumRepository) {}

  async execute(albumId: string, command: AlbumEditCommand): Promise<Result<Album, ApplicationError>> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return Result.failure(new NotFoundError("Album", albumId));

    try {
      apply(album, command);
    } catch (error) {
      if (error instanceof AlbumLockedError || error instanceof SpreadLockedError) {
        return Result.failure(new ConflictError(error.message));
      }
      if (error instanceof Error) {
        return Result.failure(new ValidationError(error.message));
      }
      throw error;
    }

    await this.albums.save(album);
    return Result.success(album);
  }
}

function apply(album: Album, command: AlbumEditCommand): void {
  switch (command.type) {
    case "RENAME":
      album.rename(command.title);
      return;
    case "REORDER_SPREAD":
      album.reorderSpread(command.fromIndex, command.toIndex);
      return;
    case "SWAP_PHOTO":
      album.swapPhoto(command.spreadIndex, command.slotId, command.photoId);
      return;
    case "SET_CROP":
      album.setCrop(command.spreadIndex, command.slotId, command.crop);
      return;
    case "SWAP_PLACEMENTS":
      album.swapPlacements(command.spreadIndex, command.slotIdA, command.slotIdB);
      return;
    case "REORDER_PLACEMENT":
      album.reorderPlacement(command.spreadIndex, command.fromSlotId, command.toSlotId);
      return;
    case "MOVE_PLACEMENT_ACROSS_SPREADS":
      album.movePlacementAcrossSpreads(
        command.fromSpreadIndex,
        command.fromSlotId,
        command.toSpreadIndex,
        command.toSlotId,
      );
      return;
    case "SET_FRAME":
      album.setFrame(command.spreadIndex, command.slotId, command.frame);
      return;
    case "RESET_FRAMES":
      album.resetFrames(command.spreadIndex);
      return;
    case "SET_FRAMES":
      album.setFrames(command.spreadIndex, command.frames);
      return;
    case "MIRROR_SPREAD":
      album.mirrorSpread(command.spreadIndex);
      return;
    case "SET_SPREAD_LOCK":
      album.setSpreadLocked(command.spreadIndex, command.locked);
      return;
    case "SET_TREATMENT":
      album.setTreatment(command.spreadIndex, command.slotId, command.treatment);
      return;
    case "SET_SPREAD_TREATMENT":
      album.setSpreadTreatment(command.spreadIndex, command.treatment);
      return;
    case "CHANGE_TEMPLATE":
      album.changeTemplate(command.spreadIndex, command.templateId, command.photoIds);
      return;
    case "ADD_SPREAD": {
      const template = findTemplate(command.templateId);
      if (!template) throw new Error(`Unknown layout template ${command.templateId}.`);
      album.addSpread(command.atIndex, template, command.photoIds);
      return;
    }
    case "REMOVE_SPREAD":
      album.removeSpread(command.index);
      return;
    case "RESTORE_SPREADS":
      // `exactOptionalPropertyTypes` treats zod's optional-with-undefined `frame`
      // as distinct from the domain's plain optional `frame?` — rebuild each
      // placement so the key is only ever present or absent, never `undefined`.
      album.restoreSpreads(
        command.spreads.map((spread) => ({
          templateId: spread.templateId,
          placements: spread.placements.map((placement) => ({
            slotId: placement.slotId,
            photoId: placement.photoId,
            crop: placement.crop,
            treatment: placement.treatment,
            ...(placement.frame ? { frame: placement.frame } : {}),
          })),
          ...(spread.texts ? { texts: spread.texts.map(withoutUndefinedFont) } : {}),
          ...(spread.locked ? { locked: true } : {}),
        })),
      );
      return;
    case "SET_TEXT_BLOCK":
      album.setTextBlock(command.spreadIndex, withoutUndefinedFont(command.block));
      return;
    case "REMOVE_TEXT_BLOCK":
      album.removeTextBlock(command.spreadIndex, command.blockId);
      return;
    case "SET_STYLE":
      album.setStyle(command.style);
      return;
    case "SET_COVER":
      album.setCover(command.cover);
      return;
    case "SUBMIT_FOR_REVIEW":
      album.submitForReview();
      return;
    case "REOPEN":
      album.reopen();
      return;
  }
}

/** Same `exactOptionalPropertyTypes` reason as frames above: an unset font is absent, not undefined. */
function withoutUndefinedFont(block: TextBlockDTO): TextBlockDTO {
  const { font, ...rest } = block;
  return font ? { ...rest, font } : rest;
}
