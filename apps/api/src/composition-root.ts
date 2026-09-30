import { S3Client } from "@aws-sdk/client-s3";
import { SubscriptionPlanFeatureDirectory } from "./modules/identity/infrastructure/gateways/subscription-plan-features";
import type { ConnectionOptions } from "bullmq";
import { loadEnv, type Env } from "./shared-kernel/env";
import { createDatabase, type Database } from "./db/client";

import {
  DrizzleStudioMemberRepository,
  DrizzleStudioRepository,
  DrizzleSubscriptionRepository,
} from "./modules/identity/infrastructure/persistence/drizzle-studio-repository";
import { StudioAdministrationUseCase } from "./modules/identity/application/use-cases/studio-administration.use-case";
import { RegisterUseCase } from "./modules/identity/application/use-cases/register.use-case";
import { LoginUseCase } from "./modules/identity/application/use-cases/login.use-case";
import { PasswordResetUseCase } from "./modules/identity/application/use-cases/password-reset.use-case";
import { PasswordResetMailer } from "./modules/identity/application/services/password-reset.mailer";
import { BillingUseCase } from "./modules/identity/application/use-cases/billing.use-case";
import { buildBillingGateway } from "./infrastructure/billing/build-billing-gateway";
import { SubscriptionQuotaPolicy } from "./modules/identity/application/subscription-quota-policy";

import { DrizzleProjectRepository } from "./modules/media-ingestion/infrastructure/persistence/drizzle-project-repository";
import { DrizzlePhotoRepository } from "./modules/media-ingestion/infrastructure/persistence/drizzle-photo-repository";
import { S3ObjectStorage } from "./modules/media-ingestion/infrastructure/storage/s3-object-storage";
import { BullMqJobQueue } from "./modules/media-ingestion/infrastructure/queue/bullmq-job-queue";
import { RequestUploadUseCase } from "./modules/media-ingestion/application/use-cases/request-upload/request-upload.use-case";
import { AbandonUploadUseCase } from "./modules/media-ingestion/application/use-cases/abandon-upload/abandon-upload.use-case";
import { ListStudioProjectsUseCase } from "./modules/media-ingestion/application/use-cases/list-studio-projects/list-studio-projects.use-case";
import { ConfirmUploadUseCase } from "./modules/media-ingestion/application/use-cases/confirm-upload/confirm-upload.use-case";
import { ListProjectPhotosUseCase } from "./modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { DeleteProjectUseCase } from "./modules/media-ingestion/application/use-cases/delete-project/delete-project.use-case";
import { GenerateDerivativesUseCase } from "./modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { SharpImageResizer } from "./modules/media-ingestion/infrastructure/imaging/sharp-image-resizer";
import { StoreOriginalUseCase } from "./modules/media-ingestion/application/use-cases/store-original/store-original.use-case";
import { StorePendingOriginalsUseCase } from "./modules/media-ingestion/application/use-cases/store-original/store-pending-originals.use-case";
import { PromoteSelectedPhotosUseCase } from "./modules/media-ingestion/application/use-cases/promote-selected/promote-selected.use-case";
import { PurgeExpiredOriginalsUseCase } from "./modules/media-ingestion/application/use-cases/purge-expired-originals/purge-expired-originals.use-case";
import { AlbumCompositionPlacementDirectory } from "./modules/media-ingestion/infrastructure/gateways/album-placement-gateway";
import { ExportPrintDeliveryDirectory } from "./modules/media-ingestion/infrastructure/gateways/delivery-gateway";
import { ReviewCollaborationClientPickDirectory } from "./modules/media-ingestion/infrastructure/gateways/client-pick-gateway";
import { DrizzlePickSessionRepository } from "./modules/review-collaboration/infrastructure/persistence/drizzle-pick-session-repository";
import { LoggingPickNotifier, MediaIngestionPickGateway } from "./modules/review-collaboration/infrastructure/gateways/pick-gateway";
import { DrizzleDownloadSessionRepository } from "./modules/review-collaboration/infrastructure/persistence/drizzle-download-session-repository";
import { CompositePickNotifier, IdentityStudioContacts, MediaIngestionDeliveryGateway } from "./modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import { ClientInvitationMailer } from "./modules/review-collaboration/application/services/client-invitation.mailer";
import { ClientLinkInvitations } from "./modules/review-collaboration/application/services/client-link-invitations";
import { ProjectClientContactDirectory } from "./modules/review-collaboration/infrastructure/gateways/client-contact-gateway";
import { StudioEmailNotifier } from "./modules/review-collaboration/application/services/studio-email-notifier";
import { DownloadSessionAdminUseCase } from "./modules/review-collaboration/application/use-cases/download-session-admin.use-case";
import { DownloadPortalUseCase } from "./modules/review-collaboration/application/use-cases/download-portal.use-case";
import { ReviewCollaborationDownloadHolds } from "./modules/media-ingestion/infrastructure/gateways/download-hold-gateway";
import { ClientAccessService } from "./modules/review-collaboration/application/services/client-access.service";
import { ReviewAccessUseCase } from "./modules/review-collaboration/application/use-cases/review-access.use-case";
import { SecretBox } from "./shared-kernel/secret-box";
import { ClientGrantSigner } from "./shared-kernel/client-grant";
import { buildEmailSender } from "./infrastructure/email/build-email-sender";
import { PromoteOnPickNotifier } from "./modules/review-collaboration/infrastructure/gateways/promote-on-pick-notifier";
import { PickSessionAdminUseCase } from "./modules/review-collaboration/application/use-cases/open-pick-session.use-case";
import { PickPortalUseCase } from "./modules/review-collaboration/application/use-cases/pick-portal.use-case";
import type { MediaIngestionDependencies } from "./modules/media-ingestion/interface/http/routes";
import { buildStorage } from "./infrastructure/storage/build-storage-provider";
import type { MediaUrlSigner } from "./infrastructure/storage/media-url-signer";
import { TieredPhotoByteSource } from "./infrastructure/storage/tiered-photo-byte-source";
import type { StorageProvider } from "./shared-kernel/storage-provider";
import { PromoteOnApprovalNotifier } from "./modules/review-collaboration/infrastructure/gateways/promote-on-approval-notifier";

import { DrizzlePhotoAnalysisRepository } from "./modules/photo-intelligence/infrastructure/persistence/drizzle-photo-analysis-repository";
import { SharpImageInspector } from "./modules/photo-intelligence/infrastructure/vision/sharp-image-inspector";
import { HeuristicVisionClassifier } from "./modules/photo-intelligence/infrastructure/vision/heuristic-vision-classifier";
import { buildVisionClassifier } from "./modules/photo-intelligence/infrastructure/vision/build-vision-classifier";
import { S3PhotoByteSource } from "./modules/photo-intelligence/infrastructure/storage/s3-photo-byte-source";
import { MediaIngestionPhotoLifecycle } from "./modules/photo-intelligence/infrastructure/gateways/photo-lifecycle-gateway";
import { AnalyzePhotoUseCase } from "./modules/photo-intelligence/application/use-cases/analyze-photo/analyze-photo.use-case";
import type { VisionClassifier } from "./modules/photo-intelligence/application/ports/vision-classifier";

import { DrizzleAlbumRepository } from "./modules/album-composition/infrastructure/persistence/drizzle-album-repository";
import {
  MediaIngestionProjectDirectory,
  PhotoIntelligenceDirectory,
} from "./modules/album-composition/infrastructure/gateways/directories";
import { GenerateAlbumUseCase } from "./modules/album-composition/application/use-cases/generate-album/generate-album.use-case";
import { SuggestLayoutsUseCase } from "./modules/album-composition/application/use-cases/suggest-layouts/suggest-layouts.use-case";
import { EditAlbumUseCase } from "./modules/album-composition/application/use-cases/edit-album/edit-album.use-case";
import { DeleteAlbumUseCase } from "./modules/album-composition/application/use-cases/delete-album/delete-album.use-case";

import { DrizzleReviewSessionRepository } from "./modules/review-collaboration/infrastructure/persistence/drizzle-review-session-repository";
import {
  AlbumCompositionGateway,
  LoggingReviewNotifier,
} from "./modules/review-collaboration/infrastructure/gateways/album-gateway";
import { StoragePhotoPreviewResolver } from "./modules/review-collaboration/infrastructure/gateways/photo-preview-resolver";
import { OpenReviewSessionUseCase } from "./modules/review-collaboration/application/use-cases/open-review-session.use-case";
import { ReviewPortalUseCase } from "./modules/review-collaboration/application/use-cases/review-portal.use-case";
import { AlbumFeedbackUseCase } from "./modules/review-collaboration/application/use-cases/album-feedback.use-case";

import { DrizzleExportJobRepository } from "./modules/export-print/infrastructure/persistence/drizzle-export-job-repository";
import {
  AlbumCompositionExportGateway,
  StoredPhotoResolver,
} from "./modules/export-print/infrastructure/gateways/album-gateway";
import { PdfAlbumRenderer } from "./modules/export-print/infrastructure/rendering/pdf-album-renderer";
import { S3ExportStorage } from "./modules/export-print/infrastructure/storage/s3-export-storage";
import { RequestExportUseCase } from "./modules/export-print/application/use-cases/request-export.use-case";
import { DeleteExportUseCase } from "./modules/export-print/application/use-cases/delete-export.use-case";
import { RunExportUseCase } from "./modules/export-print/application/use-cases/run-export.use-case";
import { OffsiteDatabaseBackups } from "./infrastructure/backup/offsite-database-backups";
import { QUEUES } from "./shared-kernel/job-queue";
import { RequestMetrics } from "./interface/request-metrics";
import { DrizzleFeedbackRepository } from "./modules/platform-admin/infrastructure/feedback-repositories";
import { DrizzleStatsSource } from "./modules/platform-admin/infrastructure/stats-sources";
import { LiveDependencyProbe } from "./modules/platform-admin/infrastructure/dependency-probes";
import {
  AdminAccess,
  AdminDashboardUseCase,
  FeedbackUseCase,
  StudioPlansUseCase,
} from "./modules/platform-admin/application/use-cases/admin.use-cases";

export interface CompositionRoot {
  env: Env;
  db: Database;
  studios: DrizzleStudioRepository;
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
  shutdown: () => Promise<void>;
}

function redisConnectionFrom(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}

export function buildCompositionRoot(env: Env = loadEnv()): CompositionRoot {
  const { db, close: closeDb } = createDatabase(env.DATABASE_URL);

  const s3Config = {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  };
  const s3 = new S3Client(s3Config);
  const presignS3 = env.S3_PUBLIC_ENDPOINT
    ? new S3Client({ ...s3Config, endpoint: env.S3_PUBLIC_ENDPOINT })
    : s3;

  // Identity & billing
  const studios = new DrizzleStudioRepository(db);
  const subscriptions = new DrizzleSubscriptionRepository(db);
  const members = new DrizzleStudioMemberRepository(db);
  const administration = new StudioAdministrationUseCase(studios, subscriptions, members);
  const register = new RegisterUseCase(studios, subscriptions, members, env.JWT_SECRET);
  const login = new LoginUseCase(members, env.JWT_SECRET);
  const quotaPolicy = new SubscriptionQuotaPolicy(subscriptions);
  const billing = new BillingUseCase(studios, subscriptions, buildBillingGateway(env), env.WEB_ORIGIN);

  // Media ingestion
  const projects = new DrizzleProjectRepository(db);
  const planFeatures = new SubscriptionPlanFeatureDirectory(projects, subscriptions);
  const photos = new DrizzlePhotoRepository(db);
  const storage = new S3ObjectStorage({
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  const jobQueue = new BullMqJobQueue(redisConnectionFrom(env.REDIS_URL));

  // Long-term tier. Absent unless configured, in which case every consumer below
  // behaves exactly as it did before this tier existed.
  const { provider: permanentStorage, signer: mediaUrlSigner } = buildStorage(env);

  const generateDerivatives = new GenerateDerivativesUseCase(
    photos,
    storage,
    new SharpImageResizer(),
    permanentStorage,
    env.PREVIEW_LONG_EDGE,
  );

  // Photo intelligence
  const analyses = new DrizzlePhotoAnalysisRepository(db);
  const byteSource = new S3PhotoByteSource(s3, env.S3_BUCKET);
  const visionClassifier = buildVisionClassifier({
    provider: env.VISION_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    ollamaModel: env.OLLAMA_MODEL,
  });
  const analyzePhoto = new AnalyzePhotoUseCase(
    analyses,
    byteSource,
    new SharpImageInspector(),
    new HeuristicVisionClassifier(),
    visionClassifier,
    new MediaIngestionPhotoLifecycle(photos),
  );

  // Album composition
  const albums = new DrizzleAlbumRepository(db);
  const generateAlbum = new GenerateAlbumUseCase(
    albums,
    new MediaIngestionProjectDirectory(projects),
    new PhotoIntelligenceDirectory(analyses),
    quotaPolicy,
  );
  const editAlbum = new EditAlbumUseCase(albums);
  const suggestLayouts = new SuggestLayoutsUseCase(new PhotoIntelligenceDirectory(analyses));

  const emailSender = buildEmailSender(env);
  const passwordReset = new PasswordResetUseCase(
    members,
    new PasswordResetMailer(emailSender),
    env.JWT_SECRET,
    env.WEB_ORIGIN,
  );

  // Review & collaboration
  const studioContacts = new IdentityStudioContacts(projects, members, studios);
  // Client invitations: the photographer's own "here is your link" email, for all three
  // link kinds, plus the shoot's client contact they prefill from.
  const clientContacts = new ProjectClientContactDirectory(projects, albums);
  const invitations = new ClientLinkInvitations(
    new ClientInvitationMailer(emailSender),
    clientContacts,
    studioContacts,
    env.WEB_ORIGIN,
  );
  const reviewSessions = new DrizzleReviewSessionRepository(db);
  const pickSessions = new DrizzlePickSessionRepository(db);
  const downloadSessions = new DrizzleDownloadSessionRepository(db);
  const reviewAlbumGateway = new AlbumCompositionGateway(
    albums,
    new StoragePhotoPreviewResolver(photos, storage, permanentStorage),
    planFeatures,
  );
  // Passwords for client links (album review and download): generated per link, checked
  // against a hash, and kept encrypted so the studio can look the link + password up again.
  const clientAccess = new ClientAccessService(new SecretBox(env.JWT_SECRET), new ClientGrantSigner(env.JWT_SECRET));
  const openReviewSession = new OpenReviewSessionUseCase(
    reviewSessions,
    reviewAlbumGateway,
    clientAccess,
    invitations,
    clientContacts,
  );
  const reviewAccess = new ReviewAccessUseCase(reviewSessions, clientAccess, invitations, clientContacts);
  const albumFeedback = new AlbumFeedbackUseCase(reviewSessions);
  const reviewPortal = new ReviewPortalUseCase(
    reviewSessions,
    reviewAlbumGateway,
    permanentStorage
      ? new PromoteOnApprovalNotifier(new LoggingReviewNotifier(), jobQueue)
      : new LoggingReviewNotifier(),
    clientAccess,
  );

  // Client photo selection ("picks"), the step before an album exists.
  const pickGateway = new MediaIngestionPickGateway(
    projects,
    photos,
    new ListProjectPhotosUseCase(photos, storage, permanentStorage),
  );
  const pickAdmin = new PickSessionAdminUseCase(
    pickSessions,
    pickGateway,
    clientAccess,
    invitations,
    clientContacts,
  );
  // Email the studio's owners when a client sends picks or finishes a download.
  const studioEmail = new StudioEmailNotifier(emailSender, studioContacts, env.WEB_ORIGIN);
  const loggedAndEmailed = new CompositePickNotifier([new LoggingPickNotifier(), studioEmail]);
  const pickPortal = new PickPortalUseCase(
    pickSessions,
    pickGateway,
    permanentStorage ? new PromoteOnPickNotifier(loggedAndEmailed, jobQueue) : loggedAndEmailed,
    clientAccess,
  );

  // Client delivery: a time-limited link that downloads every original as one ZIP.
  const deliveryGateway = new MediaIngestionDeliveryGateway(projects, photos, storage, permanentStorage);
  const downloadAdmin = new DownloadSessionAdminUseCase(
    downloadSessions,
    deliveryGateway,
    () => new Date(),
    clientAccess,
    invitations,
    clientContacts,
    planFeatures,
  );
  const downloadPortal = new DownloadPortalUseCase(
    downloadSessions,
    deliveryGateway,
    studioEmail,
    console.error,
    () => new Date(),
    clientAccess,
    pickGateway,
  );

  // Export & print
  const exportJobs = new DrizzleExportJobRepository(db);
  const exportAlbumGateway = new AlbumCompositionExportGateway(albums, planFeatures);
  const exportStorage = new S3ExportStorage(s3, env.S3_BUCKET, presignS3);
  const requestExport = new RequestExportUseCase(exportJobs, exportAlbumGateway, jobQueue);
  const deleteExport = new DeleteExportUseCase(exportJobs, exportStorage);
  const runExport = new RunExportUseCase(
    exportJobs,
    exportAlbumGateway,
    new PdfAlbumRenderer(
      new StoredPhotoResolver(
        photos,
        // After retention, an original may live only on long-term storage.
        permanentStorage ? new TieredPhotoByteSource(byteSource, permanentStorage) : byteSource,
      ),
    ),
    exportStorage,
  );

  const deleteAlbum = new DeleteAlbumUseCase(albums, exportJobs, exportStorage, reviewSessions);
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
  const storeOriginal = permanentStorage
    ? new StoreOriginalUseCase(photos, storage, permanentStorage)
    : undefined;
  const storePending = storeEverything && storeOriginal ? new StorePendingOriginalsUseCase(photos, storeOriginal) : undefined;
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

  const offsiteBackups =
    permanentStorage && env.BACKUP_DIR
      ? new OffsiteDatabaseBackups(permanentStorage, env.BACKUP_DIR, env.BACKUP_KEEP)
      : undefined;

  // Platform admin: in-app feedback and the operator dashboard.
  const requestMetrics = new RequestMetrics();
  const adminAccess = new AdminAccess(members, env.ADMIN_EMAILS);
  const feedbackRepository = new DrizzleFeedbackRepository(db);
  const feedback = new FeedbackUseCase(feedbackRepository, members, studios, adminAccess, emailSender, env.WEB_ORIGIN);
  const adminDashboard = new AdminDashboardUseCase(
    new DrizzleStatsSource(db),
    feedbackRepository,
    new LiveDependencyProbe(db, () => jobQueue.counts(Object.values(QUEUES))),
    requestMetrics,
    {
      mode: "production",
      storage: env.STORAGE_PROVIDER,
      email: env.EMAIL_PROVIDER,
      billing: env.BILLING_PROVIDER,
      vision: env.VISION_PROVIDER,
      errorMonitoring: Boolean(env.SENTRY_DSN),
    },
    permanentStorage,
  );
  const studioPlans = new StudioPlansUseCase(studios, subscriptions);

  const mediaIngestion: MediaIngestionDependencies = {
    requestUpload: new RequestUploadUseCase(projects, photos, storage, planFeatures),
    confirmUpload: new ConfirmUploadUseCase(photos, storage, jobQueue, storeEverything),
    abandonUpload: new AbandonUploadUseCase(photos, storage),
    listStudioProjects: new ListStudioProjectsUseCase(projects, photos, albums, storage, permanentStorage),
    listProjectPhotos: new ListProjectPhotosUseCase(photos, storage, permanentStorage),
    deleteProject,
    projects,
  };

  return {
    env,
    db,
    studios,
    projects,
    photos,
    administration,
    register,
    login,
    passwordReset,
    billing,
    mediaIngestion,
    generateDerivatives,
    permanentStorage,
    mediaUrlSigner,
    promoteSelected,
    storeOriginal,
    storePending,
    purgeExpiredOriginals,
    offsiteBackups,
    analyses,
    analyzePhoto,
    visionClassifier,
    albums,
    suggestLayouts,
    generateAlbum,
    editAlbum,
    deleteAlbum,
    reviewSessions,
    openReviewSession,
    reviewPortal,
    albumFeedback,
    pickAdmin,
    pickPortal,
    downloadAdmin,
    downloadPortal,
    reviewAccess,
    exportJobs,
    requestExport,
    deleteExport,
    runExport,
    exportStorage,
    requestMetrics,
    adminAccess,
    feedback,
    adminDashboard,
    studioPlans,
    shutdown: async () => {
      await Promise.all([closeDb(), jobQueue.close()]);
    },
  };
}
