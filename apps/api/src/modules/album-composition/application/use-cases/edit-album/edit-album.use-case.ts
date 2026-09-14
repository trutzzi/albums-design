import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type ApplicationError,
} from "../../../../../shared-kernel/errors";
import {
  Album,
  AlbumLockedError,
  type Crop,
  type PhotoTreatment,
  type SlotFrame,
} from "../../../domain/album";
import type { AlbumRepository } from "../../../domain/album-repository";
import { findTemplate } from "../../../domain/layout-template";

export type AlbumEditCommand =
  | { type: "RENAME"; title: string }
  | { type: "REORDER_SPREAD"; fromIndex: number; toIndex: number }
  | { type: "SWAP_PHOTO"; spreadIndex: number; slotId: string; photoId: string }
  | { type: "SET_CROP"; spreadIndex: number; slotId: string; crop: Crop }
  | { type: "SWAP_PLACEMENTS"; spreadIndex: number; slotIdA: string; slotIdB: string }
  | { type: "SET_FRAME"; spreadIndex: number; slotId: string; frame: SlotFrame }
  | { type: "RESET_FRAMES"; spreadIndex: number }
  | { type: "SET_TREATMENT"; spreadIndex: number; slotId: string; treatment: PhotoTreatment }
  | { type: "SET_SPREAD_TREATMENT"; spreadIndex: number; treatment: PhotoTreatment }
  | { type: "CHANGE_TEMPLATE"; spreadIndex: number; templateId: string; photoIds?: string[] | undefined }
  | { type: "ADD_SPREAD"; atIndex: number; templateId: string; photoIds: string[] }
  | { type: "REMOVE_SPREAD"; index: number }
  | { type: "SUBMIT_FOR_REVIEW" }
  | { type: "REOPEN" };

export class EditAlbumUseCase {
  constructor(private readonly albums: AlbumRepository) {}

  async execute(
    albumId: string,
    command: AlbumEditCommand,
  ): Promise<Result<Album, ApplicationError>> {
    const album = await this.albums.findById(UniqueEntityId.create(albumId));
    if (!album) return Result.failure(new NotFoundError("Album", albumId));

    try {
      apply(album, command);
    } catch (error) {
      if (error instanceof AlbumLockedError) {
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
    case "SET_FRAME":
      album.setFrame(command.spreadIndex, command.slotId, command.frame);
      return;
    case "RESET_FRAMES":
      album.resetFrames(command.spreadIndex);
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
    case "SUBMIT_FOR_REVIEW":
      album.submitForReview();
      return;
    case "REOPEN":
      album.reopen();
      return;
  }
}
