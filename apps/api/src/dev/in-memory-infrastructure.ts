import type { AppSettings, ModuleInfrastructure, Repositories } from "../composition/ports";
import type { Logger } from "../shared-kernel/logger";
import { ConsoleLogger } from "../shared-kernel/logger";
import type { EmailSender } from "../shared-kernel/email";
import type { StorageProvider } from "../shared-kernel/storage-provider";
import { RepositoryResourceOwnership } from "../interface/tenancy";
import { ErrorRecordingLogger } from "../infrastructure/monitoring/error-recording-logger";
import { SmtpEmailSender } from "../infrastructure/email/smtp-email-sender";
import { LoggingEmailSender } from "../infrastructure/email/logging-email-sender";
import { MediaUrlSigner } from "../infrastructure/storage/media-url-signer";
import { DigiStorageProvider } from "../infrastructure/storage/digistorage-storage-provider";
import { NoBillingGateway } from "../modules/identity/application/ports/billing-gateway";
import { InMemoryErrorLogRepository } from "../modules/platform-admin/infrastructure/error-log-repositories";
import { InMemoryFeedbackRepository } from "../modules/platform-admin/infrastructure/feedback-repositories";
import { InMemoryStatsSource } from "../modules/platform-admin/infrastructure/stats-sources";
import { InProcessDependencyProbe } from "../modules/platform-admin/infrastructure/dependency-probes";
import {
  InMemoryAlbumRepository,
  InMemoryDownloadSessionRepository,
  InMemoryExportJobRepository,
  InMemoryPhotoAnalysisRepository,
  InMemoryPhotoRepository,
  InMemoryPickSessionRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
} from "./in-memory-adapters";
import { InMemoryStorageProvider } from "./in-memory-storage-provider";
import { LocalBlobStore } from "./local-blob-store";
import { SynchronousJobQueue } from "./synchronous-job-queue";

export interface InMemoryAdapterOptions {
  settings: AppSettings;
  /** Where this server is reachable, for the URLs uploads and previews go through. */
  baseUrl: string;
  /** "none" keeps one storage tier; "memory" runs the two-tier pipeline with no account; "digistorage" uses the real one. */
  storageProvider: string;
  /** Process environment for the optional SMTP and DigiStorage settings. */
  source: NodeJS.ProcessEnv;
}

/** Real mail when SMTP is fully configured for the demo; otherwise each message is printed to the log. */
function demoEmailSender(source: NodeJS.ProcessEnv, logger: Logger): EmailSender {
  return source.EMAIL_PROVIDER === "smtp" &&
    source.SMTP_HOST &&
    source.MAIL_FROM &&
    // A login with no password can only fail, and mail servers lock out repeated failures.
    !(source.SMTP_USER && !source.SMTP_PASSWORD)
    ? new SmtpEmailSender({
        host: source.SMTP_HOST,
        port: Number(source.SMTP_PORT ?? 587),
        secure: source.SMTP_SECURE === "true",
        user: source.SMTP_USER || undefined,
        password: source.SMTP_PASSWORD || undefined,
        from: source.MAIL_FROM,
      })
    : new LoggingEmailSender(logger.child({ component: "email" }));
}

function demoPermanentStorage(
  provider: string,
  source: NodeJS.ProcessEnv,
  signer: MediaUrlSigner,
): StorageProvider | undefined {
  if (provider === "memory") return new InMemoryStorageProvider(signer);
  if (provider !== "digistorage") return undefined;
  const { DIGISTORAGE_WEBDAV_URL, DIGISTORAGE_USERNAME, DIGISTORAGE_APP_PASSWORD } = source;
  if (!DIGISTORAGE_WEBDAV_URL || !DIGISTORAGE_USERNAME || !DIGISTORAGE_APP_PASSWORD) {
    throw new Error(
      "STORAGE_PROVIDER=digistorage needs DIGISTORAGE_WEBDAV_URL, DIGISTORAGE_USERNAME and DIGISTORAGE_APP_PASSWORD.",
    );
  }
  return new DigiStorageProvider({
    webdavUrl: DIGISTORAGE_WEBDAV_URL,
    username: DIGISTORAGE_USERNAME,
    appPassword: DIGISTORAGE_APP_PASSWORD,
    rootPath: source.DIGISTORAGE_ROOT_PATH ?? "albumflow-demo",
    urlSigner: signer,
  });
}

/**
 * The demo's family of adapters (the in-memory counterpart of `buildInfrastructure` and
 * `buildRepositories`): everything lives in this process and is gone on restart. Also
 * returns the concrete blob store and queue, which the demo server serves and drives.
 */
export function buildInMemoryAdapters({ settings, baseUrl, storageProvider, source }: InMemoryAdapterOptions) {
  // Readable lines, not JSON: demo mode is read by a developer at a terminal. Errors are also
  // kept for the admin Errors tab, in memory like everything else here.
  const errorLog = new InMemoryErrorLogRepository();
  const logger: Logger = new ErrorRecordingLogger(new ConsoleLogger({ service: "demo" }), errorLog, "api");

  const repos = {
    studios: new InMemoryStudioRepository(),
    subscriptions: new InMemorySubscriptionRepository(),
    members: new InMemoryStudioMemberRepository(),
    projects: new InMemoryProjectRepository(),
    photos: new InMemoryPhotoRepository(),
    analyses: new InMemoryPhotoAnalysisRepository(),
    albums: new InMemoryAlbumRepository(),
    reviewSessions: new InMemoryReviewSessionRepository(),
    pickSessions: new InMemoryPickSessionRepository(),
    downloadSessions: new InMemoryDownloadSessionRepository(),
    exportJobs: new InMemoryExportJobRepository(),
    feedback: new InMemoryFeedbackRepository(),
  } satisfies Repositories;

  // One blob store stands in for S3 as staging storage, the byte source and the export store.
  const blobs = new LocalBlobStore(baseUrl);
  const queue = new SynchronousJobQueue();
  const mediaUrlSigner = new MediaUrlSigner(settings.JWT_SECRET, baseUrl);
  const emailSender = demoEmailSender(source, logger);

  const infra: ModuleInfrastructure = {
    env: settings,
    logger,
    emailSender,
    storage: blobs,
    jobQueue: queue,
    permanentStorage: demoPermanentStorage(storageProvider, source, mediaUrlSigner),
    byteSource: blobs,
    exportStorage: blobs,
    // The demo never takes payment: choosing a plan switches it.
    billingGateway: new NoBillingGateway(),
    errorLog,
    statsSource: new InMemoryStatsSource({
      studios: repos.studios,
      subscriptions: repos.subscriptions,
      projects: repos.projects,
      photos: repos.photos,
      albums: repos.albums,
      reviews: repos.reviewSessions,
      picks: repos.pickSessions,
      exports: repos.exportJobs,
    }),
    dependencyProbe: new InProcessDependencyProbe(),
    systemConfig: {
      mode: "demo",
      storage: storageProvider,
      email: emailSender.id,
      billing: "none",
      vision: settings.VISION_PROVIDER,
      errorMonitoring: false,
    },
    resourceOwnership: new RepositoryResourceOwnership(repos),
  };

  return { infra, repos, blobs, queue, mediaUrlSigner };
}
