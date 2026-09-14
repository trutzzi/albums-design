import { Result } from "@albumflow/domain-kernel";
import { ValidationError, type ApplicationError } from "../../../../../shared-kernel/errors";
import {
  MAX_SLOTS_PER_SPREAD,
  rankTemplates,
  type CandidatePhoto,
} from "../../../domain/layout-planner";
import type { AnalysedPhotoDirectory } from "../../ports/directories";

export interface SuggestLayoutsCommand {
  projectId: string;
  photoIds: string[];
}

export interface LayoutSuggestion {
  templateId: string;
  name: string;
  /** Photo ids in slot order — the strongest frame lands in the largest slot. */
  photoIds: string[];
  fitScore: number;
}

/**
 * Turns a hand-picked set of photos into the layouts that suit them, best first.
 * The photographer gets the top one applied automatically and can shuffle through
 * the rest — the same ranking the automatic planner uses, just surfaced.
 */
export class SuggestLayoutsUseCase {
  constructor(private readonly analysed: AnalysedPhotoDirectory) {}

  async execute(
    command: SuggestLayoutsCommand,
  ): Promise<Result<LayoutSuggestion[], ApplicationError>> {
    const count = command.photoIds.length;
    if (count < 1 || count > MAX_SLOTS_PER_SPREAD) {
      return Result.failure(
        new ValidationError(`A spread holds between 1 and ${MAX_SLOTS_PER_SPREAD} photos.`),
      );
    }

    const analysed = await this.analysed.listForProject(command.projectId);
    const byId = new Map(analysed.map((photo) => [photo.photoId, photo]));

    // A photo still being analysed has no score yet; treat it as average rather than
    // refusing, so the editor keeps working while analysis catches up.
    const selected: CandidatePhoto[] = command.photoIds.map(
      (photoId, index) =>
        byId.get(photoId) ?? {
          photoId,
          score: 70,
          category: "CANDID",
          orientation: "LANDSCAPE",
          capturedAt: index,
        },
    );

    const ranked = rankTemplates(selected, { exactSlots: count });
    if (ranked.length === 0) {
      return Result.failure(new ValidationError(`No layout holds exactly ${count} photos.`));
    }

    return Result.success(
      ranked.map((entry) => ({
        templateId: entry.template.id,
        name: entry.template.name,
        photoIds: entry.assignment.map((photoIndex) => selected[photoIndex]?.photoId ?? ""),
        fitScore: Math.round(entry.score * 100) / 100,
      })),
    );
  }
}
