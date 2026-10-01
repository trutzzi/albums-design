import { QUEUES } from "../shared-kernel/job-queue";
import { RequestMetrics } from "../interface/request-metrics";
import { DrizzleStatsSource } from "../modules/platform-admin/infrastructure/stats-sources";
import { LiveDependencyProbe } from "../modules/platform-admin/infrastructure/dependency-probes";
import {
  AdminAccess,
  AdminDashboardUseCase,
  FeedbackUseCase,
  StudioPlansUseCase,
} from "../modules/platform-admin/application/use-cases/admin.use-cases";
import {
  DeleteStudioUseCase,
  PurgeUnconfirmedSignupsUseCase,
} from "../modules/platform-admin/application/use-cases/studio-deletion.use-cases";
import { ErrorInboxUseCase } from "../modules/platform-admin/application/use-cases/error-inbox.use-case";
import type { Infrastructure } from "./infrastructure";
import type { Repositories } from "./repositories";
import type { MediaIngestionModule } from "./media-ingestion.module";

/** Platform admin: in-app feedback, the operator dashboard, and account housekeeping. */
export function buildPlatformAdminModule(
  { env, logger, db, emailSender, jobQueue, permanentStorage, errorLog }: Infrastructure,
  { members, studios, subscriptions, projects, feedback: feedbackRepository }: Repositories,
  { deleteProject }: Pick<MediaIngestionModule, "deleteProject">,
) {
  const requestMetrics = new RequestMetrics();
  const adminAccess = new AdminAccess(members, env.ADMIN_EMAILS);
  const deleteStudio = new DeleteStudioUseCase(
    studios,
    subscriptions,
    members,
    projects,
    deleteProject,
    feedbackRepository,
    adminAccess,
  );
  return {
    requestMetrics,
    adminAccess,
    feedback: new FeedbackUseCase(
      feedbackRepository,
      members,
      studios,
      adminAccess,
      emailSender,
      env.WEB_ORIGIN,
      logger.child({ component: "feedback" }),
    ),
    adminDashboard: new AdminDashboardUseCase(
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
    ),
    studioPlans: new StudioPlansUseCase(studios, subscriptions, members, projects),
    errorInbox: new ErrorInboxUseCase(errorLog, env.ERROR_LOG_RETENTION_DAYS),
    deleteStudio,
    /** The hourly sweep of signups nobody confirmed (run by the worker). */
    purgeUnconfirmedSignups: new PurgeUnconfirmedSignupsUseCase(members, projects, deleteStudio),
  };
}

export type PlatformAdminModule = ReturnType<typeof buildPlatformAdminModule>;
