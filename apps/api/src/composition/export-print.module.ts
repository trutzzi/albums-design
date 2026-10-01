import { TieredPhotoByteSource } from "../infrastructure/storage/tiered-photo-byte-source";
import { RequestExportUseCase } from "../modules/export-print/application/use-cases/request-export.use-case";
import { DeleteExportUseCase } from "../modules/export-print/application/use-cases/delete-export.use-case";
import { RunExportUseCase } from "../modules/export-print/application/use-cases/run-export.use-case";
import {
  AlbumCompositionExportGateway,
  StoredPhotoResolver,
} from "../modules/export-print/infrastructure/gateways/album-gateway";
import { PdfAlbumRenderer } from "../modules/export-print/infrastructure/rendering/pdf-album-renderer";
import { S3ExportStorage } from "../modules/export-print/infrastructure/storage/s3-export-storage";
import type { Infrastructure } from "./infrastructure";
import type { Repositories } from "./repositories";
import type { IdentityModule } from "./identity.module";
import type { PhotoIntelligenceModule } from "./photo-intelligence.module";

/** Export & print: queued PDF rendering of an approved album, and the stored files. */
export function buildExportPrintModule(
  { env, s3, presignS3, jobQueue, permanentStorage, byteSource }: Infrastructure,
  { exportJobs, albums, photos }: Repositories,
  { planFeatures, photoFocus }: Pick<IdentityModule, "planFeatures"> & Pick<PhotoIntelligenceModule, "photoFocus">,
) {
  const albumGateway = new AlbumCompositionExportGateway(albums, planFeatures, photoFocus);
  const exportStorage = new S3ExportStorage(s3, env.S3_BUCKET, presignS3);
  return {
    exportStorage,
    requestExport: new RequestExportUseCase(exportJobs, albumGateway, jobQueue),
    deleteExport: new DeleteExportUseCase(exportJobs, exportStorage),
    runExport: new RunExportUseCase(
      exportJobs,
      albumGateway,
      new PdfAlbumRenderer(
        new StoredPhotoResolver(
          photos,
          // After retention, an original may live only on long-term storage.
          permanentStorage ? new TieredPhotoByteSource(byteSource, permanentStorage) : byteSource,
        ),
      ),
      exportStorage,
    ),
  };
}

export type ExportPrintModule = ReturnType<typeof buildExportPrintModule>;
