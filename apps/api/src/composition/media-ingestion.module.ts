import { RequestUploadUseCase } from "../modules/media-ingestion/application/use-cases/request-upload/request-upload.use-case";
import { AbandonUploadUseCase } from "../modules/media-ingestion/application/use-cases/abandon-upload/abandon-upload.use-case";
import { ListStudioProjectsUseCase } from "../modules/media-ingestion/application/use-cases/list-studio-projects/list-studio-projects.use-case";
import { ConfirmUploadUseCase } from "../modules/media-ingestion/application/use-cases/confirm-upload/confirm-upload.use-case";
import { ListProjectPhotosUseCase } from "../modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { DeleteProjectUseCase } from "../modules/media-ingestion/application/use-cases/delete-project/delete-project.use-case";
import { GenerateDerivativesUseCase } from "../modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { StoreOriginalUseCase } from "../modules/media-ingestion/application/use-cases/store-original/store-original.use-case";
import { StorePendingOriginalsUseCase } from "../modules/media-ingestion/application/use-cases/store-original/store-pending-originals.use-case";
import { PromoteSelectedPhotosUseCase } from "../modules/media-ingestion/application/use-cases/promote-selected/promote-selected.use-case";
import { PurgeExpiredOriginalsUseCase } from "../modules/media-ingestion/application/use-cases/purge-expired-originals/purge-expired-originals.use-case";
import { SharpImageResizer } from "../modules/media-ingestion/infrastructure/imaging/sharp-image-resizer";
import { AlbumCompositionPlacementDirectory } from "../modules/media-ingestion/infrastructure/gateways/album-placement-gateway";
import { ExportPrintDeliveryDirectory } from "../modules/media-ingestion/infrastructure/gateways/delivery-gateway";
import { ReviewCollaborationClientPickDirectory } from "../modules/media-ingestion/infrastructure/gateways/client-pick-gateway";
import { ReviewCollaborationDownloadHolds } from "../modules/media-ingestion/infrastructure/gateways/download-hold-gateway";
import type { MediaIngestionDependencies } from "../modules/media-ingestion/interface/http/routes";
import type { Infrastructure } from "./infrastructure";
import type { Repositories } from "./repositories";
import type { IdentityModule } from "./identity.module";
import type { ExportPrintModule } from "./export-print.module";

/** Media ingestion: shoots, uploads, display copies, and the two-tier storage pipeline. */
export function buildMediaIngestionModule(
  { env, logger, storage, jobQueue, permanentStorage }: Infrastructure,
  repos: Repositories,
  { planFeatures, exportStorage }: Pick<IdentityModule, "planFeatures"> & Pick<ExportPrintModule, "exportStorage">,
) {
  const { projects, photos, analyses, albums, exportJobs, reviewSessions, pickSessions, downloadSessions } = repos;
  const storageLog = logger.child({ component: "storage" });

  const deleteProject = new DeleteProjectUseCase(
    projects,
    photos,
    storage,
    analyses,
    albums,
    exportJobs,
    exportStorage,
    reviewSessions,
    permanentStorage,
    pickSessions,
    downloadSessions,
  );

  // Two-tier pipeline, second and third stages: promote chosen originals to
  // long-term storage, and expire the staged copies after delivery.
  const placements = new AlbumCompositionPlacementDirectory(albums);
  const clientPicks = new ReviewCollaborationClientPickDirectory(pickSessions);
  const promoteSelected = permanentStorage
    ? new PromoteSelectedPhotosUseCase(photos, storage, permanentStorage, placements, undefined, clientPicks)
    : undefined;
  // "All": every uploaded original is copied to long-term storage — right after upload,
  // and by a periodic sweep that also backfills photos uploaded before it was switched on.
  const storeEverything = Boolean(permanentStorage) && env.LONG_TERM_ORIGINALS === "all";
  const storeOriginal = permanentStorage ? new StoreOriginalUseCase(photos, storage, permanentStorage) : undefined;
  const storePending =
    storeEverything && storeOriginal
      ? new StorePendingOriginalsUseCase(photos, storeOriginal, Date.now, storageLog)
      : undefined;
  const purgeExpiredOriginals = promoteSelected
    ? new PurgeExpiredOriginalsUseCase(
        projects,
        photos,
        storage,
        new ExportPrintDeliveryDirectory(exportJobs, albums),
        placements,
        promoteSelected,
        env.ORIGINAL_RETENTION_DAYS,
        undefined,
        clientPicks,
        new ReviewCollaborationDownloadHolds(downloadSessions),
        storeEverything ? storeOriginal : undefined,
      )
    : undefined;

  const http: MediaIngestionDependencies = {
    requestUpload: new RequestUploadUseCase(projects, photos, storage, planFeatures),
    confirmUpload: new ConfirmUploadUseCase(photos, storage, jobQueue, storeEverything, storageLog),
    abandonUpload: new AbandonUploadUseCase(photos, storage, storageLog),
    listStudioProjects: new ListStudioProjectsUseCase(projects, photos, albums, storage, permanentStorage, storageLog),
    listProjectPhotos: new ListProjectPhotosUseCase(photos, storage, permanentStorage),
    deleteProject,
    projects,
  };

  return {
    http,
    deleteProject,
    generateDerivatives: new GenerateDerivativesUseCase(
      photos,
      storage,
      new SharpImageResizer(),
      permanentStorage,
      env.PREVIEW_LONG_EDGE,
    ),
    promoteSelected,
    storeOriginal,
    storePending,
    purgeExpiredOriginals,
  };
}

export type MediaIngestionModule = ReturnType<typeof buildMediaIngestionModule>;
