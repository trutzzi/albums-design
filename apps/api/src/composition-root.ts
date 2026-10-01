import type { ConnectionOptions } from "bullmq";
import type pino from "pino";
import { loadEnv, type Env } from "./shared-kernel/env";
import type { Logger } from "./shared-kernel/logger";
import type { HumanCheck } from "./shared-kernel/human-check";
import type { StorageProvider } from "./shared-kernel/storage-provider";
import type { Database } from "./db/client";
import type { ResourceOwnership } from "./interface/tenancy";
import type { RequestMetrics } from "./interface/request-metrics";
import type { MediaUrlSigner } from "./infrastructure/storage/media-url-signer";
import type { OffsiteDatabaseBackups } from "./infrastructure/backup/offsite-database-backups";
import { DrizzleResourceOwnership } from "./infrastructure/persistence/drizzle-resource-ownership";
import { buildInfrastructure } from "./composition/infrastructure";
import { buildRepositories } from "./composition/repositories";
import { buildIdentityModule } from "./composition/identity.module";
import { buildPhotoIntelligenceModule } from "./composition/photo-intelligence.module";
import { buildExportPrintModule } from "./composition/export-print.module";
import { buildAlbumCompositionModule } from "./composition/album-composition.module";
import { buildMediaIngestionModule } from "./composition/media-ingestion.module";
import { buildReviewCollaborationModule } from "./composition/review-collaboration.module";
import { buildPlatformAdminModule } from "./composition/platform-admin.module";

import type { DrizzleStudioRepository } from "./modules/identity/infrastructure/persistence/drizzle-studio-repository";
import type { StudioAdministrationUseCase } from "./modules/identity/application/use-cases/studio-administration.use-case";
import type { RegisterUseCase } from "./modules/identity/application/use-cases/register.use-case";
import type { LoginUseCase } from "./modules/identity/application/use-cases/login.use-case";
import type { PasswordResetUseCase } from "./modules/identity/application/use-cases/password-reset.use-case";
import type { BillingUseCase } from "./modules/identity/application/use-cases/billing.use-case";
import type { DrizzleProjectRepository } from "./modules/media-ingestion/infrastructure/persistence/drizzle-project-repository";
import type { DrizzlePhotoRepository } from "./modules/media-ingestion/infrastructure/persistence/drizzle-photo-repository";
import type { MediaIngestionDependencies } from "./modules/media-ingestion/interface/http/routes";
import type { GenerateDerivativesUseCase } from "./modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import type { PromoteSelectedPhotosUseCase } from "./modules/media-ingestion/application/use-cases/promote-selected/promote-selected.use-case";
import type { StoreOriginalUseCase } from "./modules/media-ingestion/application/use-cases/store-original/store-original.use-case";
import type { StorePendingOriginalsUseCase } from "./modules/media-ingestion/application/use-cases/store-original/store-pending-originals.use-case";
import type { PurgeExpiredOriginalsUseCase } from "./modules/media-ingestion/application/use-cases/purge-expired-originals/purge-expired-originals.use-case";
import type { DrizzlePhotoAnalysisRepository } from "./modules/photo-intelligence/infrastructure/persistence/drizzle-photo-analysis-repository";
import type { AnalyzePhotoUseCase } from "./modules/photo-intelligence/application/use-cases/analyze-photo/analyze-photo.use-case";
import type { VisionClassifier } from "./modules/photo-intelligence/application/ports/vision-classifier";
import type { DrizzleAlbumRepository } from "./modules/album-composition/infrastructure/persistence/drizzle-album-repository";
import type { SuggestLayoutsUseCase } from "./modules/album-composition/application/use-cases/suggest-layouts/suggest-layouts.use-case";
import type { GenerateAlbumUseCase } from "./modules/album-composition/application/use-cases/generate-album/generate-album.use-case";
import type { EditAlbumUseCase } from "./modules/album-composition/application/use-cases/edit-album/edit-album.use-case";
import type { DeleteAlbumUseCase } from "./modules/album-composition/application/use-cases/delete-album/delete-album.use-case";
import type { DrizzleReviewSessionRepository } from "./modules/review-collaboration/infrastructure/persistence/drizzle-review-session-repository";
import type { OpenReviewSessionUseCase } from "./modules/review-collaboration/application/use-cases/open-review-session.use-case";
import type { ReviewPortalUseCase } from "./modules/review-collaboration/application/use-cases/review-portal.use-case";
import type { AlbumFeedbackUseCase } from "./modules/review-collaboration/application/use-cases/album-feedback.use-case";
import type { PickSessionAdminUseCase } from "./modules/review-collaboration/application/use-cases/open-pick-session.use-case";
import type { PickPortalUseCase } from "./modules/review-collaboration/application/use-cases/pick-portal.use-case";
import type { DownloadSessionAdminUseCase } from "./modules/review-collaboration/application/use-cases/download-session-admin.use-case";
import type { DownloadPortalUseCase } from "./modules/review-collaboration/application/use-cases/download-portal.use-case";
import type { ReviewAccessUseCase } from "./modules/review-collaboration/application/use-cases/review-access.use-case";
import type { DrizzleExportJobRepository } from "./modules/export-print/infrastructure/persistence/drizzle-export-job-repository";
import type { RequestExportUseCase } from "./modules/export-print/application/use-cases/request-export.use-case";
import type { DeleteExportUseCase } from "./modules/export-print/application/use-cases/delete-export.use-case";
import type { RunExportUseCase } from "./modules/export-print/application/use-cases/run-export.use-case";
import type { S3ExportStorage } from "./modules/export-print/infrastructure/storage/s3-export-storage";
import type {
  AdminAccess,
  AdminDashboardUseCase,
  FeedbackUseCase,
  StudioPlansUseCase,
} from "./modules/platform-admin/application/use-cases/admin.use-cases";
import type {
  DeleteStudioUseCase,
  PurgeUnconfirmedSignupsUseCase,
} from "./modules/platform-admin/application/use-cases/studio-deletion.use-cases";
import type { ErrorInboxUseCase } from "./modules/platform-admin/application/use-cases/error-inbox.use-case";

export interface CompositionRoot {
  env: Env;
  /** Application logger: structured, and every `error` entry also reaches Sentry. */
  logger: Logger;
  /** The same pino instance underneath, handed to Fastify so the access log shares its format and redaction. */
  pinoLogger: pino.Logger;
  /** BullMQ's view of REDIS_URL, for the worker's queues. */
  redisConnection: ConnectionOptions;
  db: Database;
  studios: DrizzleStudioRepository;
  /** Answers the tenancy guard: which studio owns the project/photo/album/export a route names. */
  resourceOwnership: ResourceOwnership;
  projects: DrizzleProjectRepository;
  photos: DrizzlePhotoRepository;
  administration: StudioAdministrationUseCase;
  register: RegisterUseCase;
  login: LoginUseCase;
  passwordReset: PasswordResetUseCase;
  billing: BillingUseCase;
  mediaIngestion: MediaIngestionDependencies;
  generateDerivatives: GenerateDerivativesUseCase;
  /** Long-term storage; `undefined` unless STORAGE_PROVIDER is configured. */
  permanentStorage: StorageProvider | undefined;
  mediaUrlSigner: MediaUrlSigner;
  promoteSelected: PromoteSelectedPhotosUseCase | undefined;
  /** Copies one original to long-term storage. Present whenever a provider is configured. */
  storeOriginal: StoreOriginalUseCase | undefined;
  /** The sweep that stores every original not yet stored. Present only with LONG_TERM_ORIGINALS=all. */
  storePending: StorePendingOriginalsUseCase | undefined;
  purgeExpiredOriginals: PurgeExpiredOriginalsUseCase | undefined;
  /** Copies database dumps off the server. Needs both BACKUP_DIR and a long-term provider. */
  offsiteBackups: OffsiteDatabaseBackups | undefined;
  analyses: DrizzlePhotoAnalysisRepository;
  analyzePhoto: AnalyzePhotoUseCase;
  visionClassifier: VisionClassifier;
  albums: DrizzleAlbumRepository;
  suggestLayouts: SuggestLayoutsUseCase;
  generateAlbum: GenerateAlbumUseCase;
  editAlbum: EditAlbumUseCase;
  deleteAlbum: DeleteAlbumUseCase;
  reviewSessions: DrizzleReviewSessionRepository;
  openReviewSession: OpenReviewSessionUseCase;
  reviewPortal: ReviewPortalUseCase;
  albumFeedback: AlbumFeedbackUseCase;
  pickAdmin: PickSessionAdminUseCase;
  pickPortal: PickPortalUseCase;
  downloadAdmin: DownloadSessionAdminUseCase;
  downloadPortal: DownloadPortalUseCase;
  reviewAccess: ReviewAccessUseCase;
  exportJobs: DrizzleExportJobRepository;
  requestExport: RequestExportUseCase;
  deleteExport: DeleteExportUseCase;
  runExport: RunExportUseCase;
  exportStorage: S3ExportStorage;
  requestMetrics: RequestMetrics;
  adminAccess: AdminAccess;
  feedback: FeedbackUseCase;
  adminDashboard: AdminDashboardUseCase;
  studioPlans: StudioPlansUseCase;
  deleteStudio: DeleteStudioUseCase;
  /** The admin error log: grouped error-level entries from the API and the worker. */
  errorInbox: ErrorInboxUseCase;
  /** Cloudflare Turnstile on signup when TURNSTILE_SECRET_KEY is set; a pass-through otherwise. */
  humanCheck: HumanCheck;
  /** The hourly sweep of signups nobody confirmed (run by the worker). */
  purgeUnconfirmedSignups: PurgeUnconfirmedSignupsUseCase;
  shutdown: () => Promise<void>;
}

export interface CompositionOptions {
  /** Which process is running, stamped on every log line and Sentry event. */
  service?: "api" | "worker";
}

/**
 * The only place that knows concrete adapters. Each bounded context wires itself in its
 * own module under `composition/`; this function only orders them — a module receives
 * exactly the outputs of earlier ones it names — and assembles what the entrypoints use.
 */
export function buildCompositionRoot(env: Env = loadEnv(), options: CompositionOptions = {}): CompositionRoot {
  const infra = buildInfrastructure(env, options.service ?? "api");
  const repos = buildRepositories(infra.db);

  const identity = buildIdentityModule(infra, repos);
  const intelligence = buildPhotoIntelligenceModule(infra, repos);
  const exportPrint = buildExportPrintModule(infra, repos, {
    planFeatures: identity.planFeatures,
    photoFocus: intelligence.photoFocus,
  });
  const composition = buildAlbumCompositionModule(repos, {
    quotaPolicy: identity.quotaPolicy,
    exportStorage: exportPrint.exportStorage,
  });
  const ingestion = buildMediaIngestionModule(infra, repos, {
    planFeatures: identity.planFeatures,
    exportStorage: exportPrint.exportStorage,
  });
  const review = buildReviewCollaborationModule(infra, repos, {
    planFeatures: identity.planFeatures,
    studioBranding: identity.studioBranding,
    photoFocus: intelligence.photoFocus,
    photoDimensions: intelligence.photoDimensions,
  });
  const admin = buildPlatformAdminModule(infra, repos, { deleteProject: ingestion.deleteProject });

  return {
    env,
    logger: infra.logger,
    pinoLogger: infra.pinoLogger,
    redisConnection: infra.redisConnection,
    db: infra.db,
    studios: repos.studios,
    resourceOwnership: new DrizzleResourceOwnership(infra.db),
    projects: repos.projects,
    photos: repos.photos,
    administration: identity.administration,
    register: identity.register,
    login: identity.login,
    passwordReset: identity.passwordReset,
    billing: identity.billing,
    humanCheck: identity.humanCheck,
    mediaIngestion: ingestion.http,
    generateDerivatives: ingestion.generateDerivatives,
    permanentStorage: infra.permanentStorage,
    mediaUrlSigner: infra.mediaUrlSigner,
    promoteSelected: ingestion.promoteSelected,
    storeOriginal: ingestion.storeOriginal,
    storePending: ingestion.storePending,
    purgeExpiredOriginals: ingestion.purgeExpiredOriginals,
    offsiteBackups: infra.offsiteBackups,
    analyses: repos.analyses,
    analyzePhoto: intelligence.analyzePhoto,
    visionClassifier: intelligence.visionClassifier,
    albums: repos.albums,
    suggestLayouts: composition.suggestLayouts,
    generateAlbum: composition.generateAlbum,
    editAlbum: composition.editAlbum,
    deleteAlbum: composition.deleteAlbum,
    reviewSessions: repos.reviewSessions,
    openReviewSession: review.openReviewSession,
    reviewPortal: review.reviewPortal,
    albumFeedback: review.albumFeedback,
    pickAdmin: review.pickAdmin,
    pickPortal: review.pickPortal,
    downloadAdmin: review.downloadAdmin,
    downloadPortal: review.downloadPortal,
    reviewAccess: review.reviewAccess,
    exportJobs: repos.exportJobs,
    requestExport: exportPrint.requestExport,
    deleteExport: exportPrint.deleteExport,
    runExport: exportPrint.runExport,
    exportStorage: exportPrint.exportStorage,
    requestMetrics: admin.requestMetrics,
    adminAccess: admin.adminAccess,
    feedback: admin.feedback,
    adminDashboard: admin.adminDashboard,
    studioPlans: admin.studioPlans,
    deleteStudio: admin.deleteStudio,
    errorInbox: admin.errorInbox,
    purgeUnconfirmedSignups: admin.purgeUnconfirmedSignups,
    shutdown: async () => {
      await Promise.all([infra.closeDb(), infra.jobQueue.close()]);
    },
  };
}
