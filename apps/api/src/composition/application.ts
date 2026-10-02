import type { ModuleInfrastructure, Repositories } from "./ports";
import { buildIdentityModule } from "./identity.module";
import { buildPhotoIntelligenceModule } from "./photo-intelligence.module";
import { buildExportPrintModule } from "./export-print.module";
import { buildAlbumCompositionModule } from "./album-composition.module";
import { buildMediaIngestionModule } from "./media-ingestion.module";
import { buildReviewCollaborationModule } from "./review-collaboration.module";
import { buildPlatformAdminModule } from "./platform-admin.module";

/**
 * Every use case, wired from whichever adapter family it is given. Each bounded context
 * wires itself in its own module; this function only orders them — a module receives
 * exactly the outputs of earlier ones it names — and flattens what the entrypoints use.
 * Production (`buildCompositionRoot`) and the demo server both start here.
 */
export function buildApplication(infra: ModuleInfrastructure, repos: Repositories) {
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
    studios: repos.studios,
    resourceOwnership: infra.resourceOwnership,
    projects: repos.projects,
    photos: repos.photos,
    administration: identity.administration,
    register: identity.register,
    login: identity.login,
    passwordReset: identity.passwordReset,
    billing: identity.billing,
    /** Cloudflare Turnstile on signup when TURNSTILE_SECRET_KEY is set; a pass-through otherwise. */
    humanCheck: identity.humanCheck,
    mediaIngestion: ingestion.http,
    generateDerivatives: ingestion.generateDerivatives,
    promoteSelected: ingestion.promoteSelected,
    /** Copies one original to long-term storage. Present whenever a provider is configured. */
    storeOriginal: ingestion.storeOriginal,
    /** The sweep that stores every original not yet stored. Present only with LONG_TERM_ORIGINALS=all. */
    storePending: ingestion.storePending,
    purgeExpiredOriginals: ingestion.purgeExpiredOriginals,
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
    /** The admin error log: grouped error-level entries from the API and the worker. */
    errorInbox: admin.errorInbox,
    /** The hourly sweep of signups nobody confirmed (run by the worker, or a timer in the demo). */
    purgeUnconfirmedSignups: admin.purgeUnconfirmedSignups,
  };
}

export type Application = ReturnType<typeof buildApplication>;
