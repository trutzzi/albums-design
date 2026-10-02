import Fastify from "fastify";
import cors from "@fastify/cors";
import { buildCompositionRoot } from "./composition-root";
import { registerStudioAuth } from "./interface/auth";
import { registerTenancyGuard } from "./interface/tenancy";
import { registerMediaRoutes } from "./interface/media-routes";
import { registerApplicationRoutes } from "./interface/application-routes";
import { flushErrorReports, startErrorMonitoring } from "./infrastructure/monitoring/error-monitoring";
import { installProcessGuards } from "./infrastructure/monitoring/process-guards";
import { httpServerOptions, registerHttpFoundation, REQUEST_ID_HEADER } from "./interface/http-foundation";

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

  registerApplicationRoutes(app, root);

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
