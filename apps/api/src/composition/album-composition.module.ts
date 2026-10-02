import { GenerateAlbumUseCase } from "../modules/album-composition/application/use-cases/generate-album/generate-album.use-case";
import { SuggestLayoutsUseCase } from "../modules/album-composition/application/use-cases/suggest-layouts/suggest-layouts.use-case";
import { EditAlbumUseCase } from "../modules/album-composition/application/use-cases/edit-album/edit-album.use-case";
import { DeleteAlbumUseCase } from "../modules/album-composition/application/use-cases/delete-album/delete-album.use-case";
import {
  MediaIngestionProjectDirectory,
  PhotoIntelligenceDirectory,
} from "../modules/album-composition/infrastructure/gateways/directories";
import type { Repositories } from "./ports";
import type { IdentityModule } from "./identity.module";
import type { ExportPrintModule } from "./export-print.module";

/** Album composition: the automatic first draft, layout suggestions and editing. */
export function buildAlbumCompositionModule(
  { albums, projects, analyses, exportJobs, reviewSessions }: Repositories,
  { quotaPolicy, exportStorage }: Pick<IdentityModule, "quotaPolicy"> & Pick<ExportPrintModule, "exportStorage">,
) {
  return {
    generateAlbum: new GenerateAlbumUseCase(
      albums,
      new MediaIngestionProjectDirectory(projects),
      new PhotoIntelligenceDirectory(analyses),
      quotaPolicy,
    ),
    editAlbum: new EditAlbumUseCase(albums),
    suggestLayouts: new SuggestLayoutsUseCase(new PhotoIntelligenceDirectory(analyses)),
    deleteAlbum: new DeleteAlbumUseCase(albums, exportJobs, exportStorage, reviewSessions),
  };
}

export type AlbumCompositionModule = ReturnType<typeof buildAlbumCompositionModule>;
