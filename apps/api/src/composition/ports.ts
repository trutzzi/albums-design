import type { Env } from "../shared-kernel/env";
import type { Logger } from "../shared-kernel/logger";
import type { EmailSender } from "../shared-kernel/email";
import type { JobQueue } from "../shared-kernel/job-queue";
import type { StorageProvider } from "../shared-kernel/storage-provider";
import type { ResourceOwnership } from "../interface/tenancy";
import type { ObjectStorageWithBody } from "../modules/media-ingestion/application/ports/object-storage";
import type { PhotoByteSource } from "../modules/photo-intelligence/application/ports/photo-source";
import type { ExportStorage } from "../modules/export-print/application/ports/album-pdf-renderer";
import type { BillingGateway } from "../modules/identity/application/ports/billing-gateway";
import type { DependencyProbe, StatsSource } from "../modules/platform-admin/application/ports/stats-source";
import type { SystemStats } from "../modules/platform-admin/application/use-cases/admin.use-cases";
import type { ErrorLogRepository } from "../modules/platform-admin/domain/error-log";
import type { FeedbackRepository } from "../modules/platform-admin/domain/feedback";
import type {
  StudioMemberRepository,
  StudioRepository,
  SubscriptionRepository,
} from "../modules/identity/domain/repositories";
import type { ProjectRepository } from "../modules/media-ingestion/domain/project-repository";
import type { PhotoRepository } from "../modules/media-ingestion/domain/photo-repository";
import type { PhotoAnalysisRepository } from "../modules/photo-intelligence/domain/photo-analysis-repository";
import type { AlbumRepository } from "../modules/album-composition/domain/album-repository";
import type { ReviewSessionRepository } from "../modules/review-collaboration/domain/review-session-repository";
import type { PickSessionRepository } from "../modules/review-collaboration/domain/pick-session-repository";
import type { DownloadSessionRepository } from "../modules/review-collaboration/domain/download-session-repository";
import type { ExportJobRepository } from "../modules/export-print/domain/export-job-repository";

/** The settings the modules read. A subset of `Env`, so the demo can supply it without a database or S3. */
export type AppSettings = Pick<
  Env,
  | "JWT_SECRET"
  | "WEB_ORIGIN"
  | "TURNSTILE_SECRET_KEY"
  | "LONG_TERM_ORIGINALS"
  | "ORIGINAL_RETENTION_DAYS"
  | "PREVIEW_LONG_EDGE"
  | "VISION_PROVIDER"
  | "ANTHROPIC_API_KEY"
  | "OLLAMA_BASE_URL"
  | "OLLAMA_MODEL"
  | "ADMIN_EMAILS"
  | "ERROR_LOG_RETENTION_DAYS"
>;

/**
 * Everything the module builders need from the outside world, as ports. Two factories
 * build it: `buildInfrastructure` (Postgres, S3, BullMQ — production and the worker) and
 * `buildInMemoryAdapters` (the demo server). The modules cannot tell them apart.
 */
export interface ModuleInfrastructure {
  env: AppSettings;
  logger: Logger;
  emailSender: EmailSender;
  /** Staging storage for uploads and display copies. */
  storage: ObjectStorageWithBody;
  jobQueue: JobQueue;
  /** Long-term tier; `undefined` unless a provider is configured. */
  permanentStorage: StorageProvider | undefined;
  /** Reads originals from staging storage (analysis, PDF rendering). */
  byteSource: PhotoByteSource;
  exportStorage: ExportStorage;
  billingGateway: BillingGateway;
  errorLog: ErrorLogRepository;
  /** The admin dashboard's view of the business and of its dependencies. */
  statsSource: StatsSource;
  dependencyProbe: DependencyProbe;
  systemConfig: SystemStats["config"];
  /** Answers the tenancy guard: which studio owns the project/photo/album/export a route names. */
  resourceOwnership: ResourceOwnership;
}

/** Every aggregate's repository, as the ports the use cases depend on. */
export interface Repositories {
  studios: StudioRepository;
  subscriptions: SubscriptionRepository;
  members: StudioMemberRepository;
  projects: ProjectRepository;
  photos: PhotoRepository;
  analyses: PhotoAnalysisRepository;
  albums: AlbumRepository;
  reviewSessions: ReviewSessionRepository;
  pickSessions: PickSessionRepository;
  downloadSessions: DownloadSessionRepository;
  exportJobs: ExportJobRepository;
  feedback: FeedbackRepository;
}
