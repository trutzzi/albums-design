import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { buildCompositionRoot } from "./composition-root";
import { clientErrorFrom } from "./shared-kernel/errors";
import { registerStudioAuth } from "./interface/auth";
import { registerTenancyGuard } from "./interface/tenancy";
import { registerMediaIngestionRoutes } from "./modules/media-ingestion/interface/http/routes";
import { registerPhotoIntelligenceRoutes } from "./modules/photo-intelligence/interface/http/routes";
import { registerAlbumCompositionRoutes } from "./modules/album-composition/interface/http/routes";
import { registerReviewRoutes } from "./modules/review-collaboration/interface/http/routes";
import { registerExportRoutes } from "./modules/export-print/interface/http/routes";
import { registerIdentityRoutes } from "./modules/identity/interface/http/routes";
import { acceptEmptyJsonBody } from "./interface/empty-body";
import { registerMediaRoutes } from "./interface/media-routes";
import { registerPickRoutes } from "./modules/review-collaboration/interface/http/pick-routes";
import { registerDownloadRoutes } from "./modules/review-collaboration/interface/http/download-routes";

async function main() {
  const root = buildCompositionRoot();
  const app = Fastify({ logger: true });

  acceptEmptyJsonBody(app);
  await app.register(cors, { origin: root.env.WEB_ORIGIN });

  app.get("/health", async () => ({ status: "ok" }));

  registerStudioAuth(app, root.studios, root.env.JWT_SECRET);
  registerTenancyGuard(app, {
    projects: root.projects,
    photos: root.photos,
    albums: root.albums,
    exportJobs: root.exportJobs,
  });

  if (root.permanentStorage) {
    registerMediaRoutes(app, { signer: root.mediaUrlSigner, provider: root.permanentStorage });
  }

  registerIdentityRoutes(app, {
    administration: root.administration,
    register: root.register,
    login: root.login,
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

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send({ code: "BAD_REQUEST", message: error.issues.map((i) => i.message).join(", ") });
    }
    const clientError = clientErrorFrom(error);
    if (clientError) {
      return reply
        .code(clientError.status)
        .send({ code: clientError.code, message: clientError.message });
    }
    app.log.error(error);
    return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Something went wrong." });
  });

  const closeGracefully = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    await app.close();
    await root.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void closeGracefully("SIGINT"));
  process.on("SIGTERM", () => void closeGracefully("SIGTERM"));

  await app.listen({ port: root.env.PORT, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
