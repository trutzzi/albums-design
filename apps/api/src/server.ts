import Fastify from "fastify";
import cors from "@fastify/cors";
import { buildCompositionRoot } from "./composition-root";
import { registerStudioAuth } from "./interface/auth";
import { registerTenancyGuard } from "./interface/tenancy";
import { registerMediaIngestionRoutes } from "./modules/media-ingestion/interface/http/routes";
import { registerPhotoIntelligenceRoutes } from "./modules/photo-intelligence/interface/http/routes";
import { registerAlbumCompositionRoutes } from "./modules/album-composition/interface/http/routes";
import { registerReviewRoutes } from "./modules/review-collaboration/interface/http/routes";
import { registerExportRoutes } from "./modules/export-print/interface/http/routes";
import { registerBillingRoutes, registerIdentityRoutes } from "./modules/identity/interface/http/routes";
import { registerMediaRoutes } from "./interface/media-routes";
import { registerPickRoutes } from "./modules/review-collaboration/interface/http/pick-routes";
import { registerDownloadRoutes } from "./modules/review-collaboration/interface/http/download-routes";
import { flushErrorReports, startErrorMonitoring } from "./infrastructure/monitoring/error-monitoring";
import { installProcessGuards } from "./infrastructure/monitoring/process-guards";
import { httpServerOptions, registerHttpFoundation, REQUEST_ID_HEADER } from "./interface/http-foundation";
import { registerPlatformAdminRoutes } from "./modules/platform-admin/interface/http/routes";

async function main() {
  const root = buildCompositionRoot(undefined, { service: "api" });
  startErrorMonitoring({ dsn: root.env.SENTRY_DSN, environment: root.env.NODE_ENV, service: "api" });
  installProcessGuards(root.logger);
  const app = Fastify({ ...httpServerOptions(root.pinoLogger), trustProxy: root.env.TRUST_PROXY });

  registerHttpFoundation(app, { logger: root.logger, metrics: root.requestMetrics });
  // Exposed so the web app can quote the id when it shows an error.
  await app.register(cors, { origin: root.env.WEB_ORIGIN, exposedHeaders: [REQUEST_ID_HEADER] });

  app.get("/health", { logLevel: "warn" }, async () => ({ status: "ok" }));

  registerStudioAuth(app, root.studios, root.env.JWT_SECRET);
  registerTenancyGuard(app, root.resourceOwnership);

  if (root.permanentStorage) {
    registerMediaRoutes(app, { signer: root.mediaUrlSigner, provider: root.permanentStorage });
  }

  registerIdentityRoutes(app, {
    administration: root.administration,
    register: root.register,
    login: root.login,
    passwordReset: root.passwordReset,
    billing: root.billing,
    humanCheck: root.humanCheck,
  });
  registerBillingRoutes(app, root.billing);
  registerPlatformAdminRoutes(app, {
    access: root.adminAccess,
    feedback: root.feedback,
    dashboard: root.adminDashboard,
    plans: root.studioPlans,
    deleteStudio: root.deleteStudio,
    errors: root.errorInbox,
  });
  registerMediaIngestionRoutes(app, root.mediaIngestion);
  registerPhotoIntelligenceRoutes(app, {
    analyses: root.analyses,
    visionClassifier: root.visionClassifier,
  });
  registerAlbumCompositionRoutes(app, {
    suggestLayouts: root.suggestLayouts,
    generateAlbum: root.generateAlbum,
    editAlbum: root.editAlbum,
    deleteAlbum: root.deleteAlbum,
    albums: root.albums,
  });
  registerReviewRoutes(app, {
    openReviewSession: root.openReviewSession,
    reviewPortal: root.reviewPortal,
    albumFeedback: root.albumFeedback,
    sessions: root.reviewSessions,
    reviewAccess: root.reviewAccess,
  });
  registerPickRoutes(app, { pickAdmin: root.pickAdmin, pickPortal: root.pickPortal });
  registerDownloadRoutes(app, { downloadAdmin: root.downloadAdmin, downloadPortal: root.downloadPortal });
  registerExportRoutes(app, {
    requestExport: root.requestExport,
    deleteExport: root.deleteExport,
    jobs: root.exportJobs,
    storage: root.exportStorage,
  });

  const closeGracefully = async (signal: string) => {
    root.logger.info("shutting down", { signal });
    try {
      await app.close();
      await root.shutdown();
    } catch (error) {
      root.logger.error("shutdown did not complete cleanly", { err: error });
    }
    await flushErrorReports();
    process.exit(0);
  };
  process.on("SIGINT", () => void closeGracefully("SIGINT"));
  process.on("SIGTERM", () => void closeGracefully("SIGTERM"));

  await app.listen({ port: root.env.PORT, host: "0.0.0.0" });
}

main().catch(async (error) => {
  // The logger may not exist yet (an invalid environment fails before it is built).
  console.error(error);
  await flushErrorReports();
  process.exit(1);
});
