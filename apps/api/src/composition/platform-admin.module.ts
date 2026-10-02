import { RequestMetrics } from "../interface/request-metrics";
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
import type { ModuleInfrastructure, Repositories } from "./ports";
import type { MediaIngestionModule } from "./media-ingestion.module";

/** Platform admin: in-app feedback, the operator dashboard, and account housekeeping. */
export function buildPlatformAdminModule(
  { env, logger, emailSender, permanentStorage, errorLog, statsSource, dependencyProbe, systemConfig }: ModuleInfrastructure,
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
      statsSource,
      feedbackRepository,
      dependencyProbe,
      requestMetrics,
      systemConfig,
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
