import type { FastifyInstance } from "fastify";
import type { Application } from "../composition/application";
import { registerBillingRoutes, registerIdentityRoutes } from "../modules/identity/interface/http/routes";
import { registerPlatformAdminRoutes } from "../modules/platform-admin/interface/http/routes";
import { registerMediaIngestionRoutes } from "../modules/media-ingestion/interface/http/routes";
import { registerPhotoIntelligenceRoutes } from "../modules/photo-intelligence/interface/http/routes";
import { registerAlbumCompositionRoutes } from "../modules/album-composition/interface/http/routes";
import { registerReviewRoutes } from "../modules/review-collaboration/interface/http/routes";
import { registerPickRoutes } from "../modules/review-collaboration/interface/http/pick-routes";
import { registerDownloadRoutes } from "../modules/review-collaboration/interface/http/download-routes";
import { registerExportRoutes } from "../modules/export-print/interface/http/routes";

/**
 * Every bounded context's HTTP routes, the same in production and in the demo. Auth, the
 * tenancy guard and anything entrypoint-specific are registered by the caller first.
 */
export function registerApplicationRoutes(app: FastifyInstance, application: Application): void {
  registerIdentityRoutes(app, {
    administration: application.administration,
    register: application.register,
    login: application.login,
    passwordReset: application.passwordReset,
    billing: application.billing,
    humanCheck: application.humanCheck,
  });
  registerBillingRoutes(app, application.billing);
  registerPlatformAdminRoutes(app, {
    access: application.adminAccess,
    feedback: application.feedback,
    dashboard: application.adminDashboard,
    plans: application.studioPlans,
    deleteStudio: application.deleteStudio,
    errors: application.errorInbox,
  });
  registerMediaIngestionRoutes(app, application.mediaIngestion);
  registerPhotoIntelligenceRoutes(app, {
    analyses: application.analyses,
    visionClassifier: application.visionClassifier,
  });
  registerAlbumCompositionRoutes(app, {
    suggestLayouts: application.suggestLayouts,
    generateAlbum: application.generateAlbum,
    editAlbum: application.editAlbum,
    deleteAlbum: application.deleteAlbum,
    albums: application.albums,
  });
  registerReviewRoutes(app, {
    openReviewSession: application.openReviewSession,
    reviewPortal: application.reviewPortal,
    albumFeedback: application.albumFeedback,
    sessions: application.reviewSessions,
    reviewAccess: application.reviewAccess,
  });
  registerPickRoutes(app, { pickAdmin: application.pickAdmin, pickPortal: application.pickPortal });
  registerDownloadRoutes(app, { downloadAdmin: application.downloadAdmin, downloadPortal: application.downloadPortal });
  registerExportRoutes(app, {
    requestExport: application.requestExport,
    deleteExport: application.deleteExport,
    jobs: application.exportJobs,
    storage: application.exportStorage,
  });
}
