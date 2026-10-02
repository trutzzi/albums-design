import Fastify from "fastify";
import cors from "@fastify/cors";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { MAX_UPLOAD_BYTES } from "@albumflow/contracts";

import { loadAppSettings } from "../shared-kernel/env";
import { QUEUES } from "../shared-kernel/job-queue";
import { registerStudioAuth } from "../interface/auth";
import { registerTenancyGuard } from "../interface/tenancy";
import { httpServerOptions, registerHttpFoundation, REQUEST_ID_HEADER } from "../interface/http-foundation";
import { registerMediaRoutes } from "../interface/media-routes";
import { registerApplicationRoutes } from "../interface/application-routes";
import { buildApplication } from "../composition/application";
import { Studio, hashApiKey } from "../modules/identity/domain/studio";
import { StudioMember } from "../modules/identity/domain/studio-member";
import { Subscription } from "../modules/identity/domain/subscription";
import { Project } from "../modules/media-ingestion/domain/project";
import { DERIVATIVE_SPECS } from "../modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { buildInMemoryAdapters } from "./in-memory-infrastructure";

const PORT = Number(process.env.PORT ?? 4000);
const BASE_URL = process.env.DEMO_BASE_URL ?? `http://localhost:${PORT}`;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";
// Long-term tier for the two-tier upload pipeline. Unset keeps the single-tier
// demo; "memory" runs the whole pipeline with no account; "digistorage" talks to
// the real thing using the same DIGISTORAGE_* variables as production.
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER ?? "none";

// Fixed so apps/web/.env can hold a static key across restarts.
export const DEMO_API_KEY = "af_demo_key_do_not_use_in_production";
export const DEMO_STUDIO_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
// Demo mode has no real secret store; this only ever signs tokens for an
// in-memory server that's wiped on restart, so a fixed value is fine here in
// a way it would not be for `loadEnv()`'s production `JWT_SECRET`.
const DEMO_JWT_SECRET = "demo-only-jwt-secret-do-not-use-in-production-00000000";

const UPLOADABLE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "application/octet-stream",
  "application/pdf",
];

/**
 * The demo API: the production application (`buildApplication`) on in-memory adapters,
 * plus what only a self-contained demo needs — byte storage served over HTTP, jobs run
 * in-process, and a seeded studio.
 */
async function main() {
  // Same validation and defaults as production for everything the modules read. Demo mode
  // still honours VISION_PROVIDER, so the local Ollama setup can be tried against the demo.
  const settings = loadAppSettings({
    ...process.env,
    JWT_SECRET: DEMO_JWT_SECRET,
    WEB_ORIGIN,
    // The demo has always cut previews at the resizer's own default.
    PREVIEW_LONG_EDGE: process.env.PREVIEW_LONG_EDGE ?? String(DERIVATIVE_SPECS.preview.longestEdge),
  });
  const { infra, repos, blobs, queue, mediaUrlSigner } = buildInMemoryAdapters({
    settings,
    baseUrl: BASE_URL,
    storageProvider: STORAGE_PROVIDER,
    source: process.env,
  });
  const { logger, emailSender, permanentStorage } = infra;
  const application = buildApplication(infra, repos);
  const { generateDerivatives, analyzePhoto, storeOriginal, promoteSelected, runExport } = application;

  // Wire the queues to run in-process.
  queue.on(QUEUES.mediaIngestion, async (_jobName, payload) => {
    const result = await generateDerivatives.execute({ photoId: String(payload.photoId) });
    if (result.isSuccess) {
      const { photoId, written } = result.getValue();
      console.log(
        `  display copies ${photoId.slice(0, 8)} → thumb ${Math.round(written.thumb / 1024)}KB, ` +
          `preview ${Math.round(written.preview / 1024)}KB`,
      );
    }
  });
  queue.on(QUEUES.photoIntelligence, async (_jobName, payload) => {
    const result = await analyzePhoto.execute({
      photoId: String(payload.photoId),
      projectId: String(payload.projectId),
      storageKey: String(payload.storageKey),
      useAi: Boolean(payload.useAi),
    });
    if (result.isSuccess) {
      const analysis = result.getValue();
      console.log(
        `  analysed ${analysis.photoId.toString().slice(0, 8)} → ${analysis.score.overall}/100 ${analysis.category} ${analysis.orientation}`,
      );
    }
  });
  queue.on(QUEUES.storage, async (jobName, payload) => {
    if (jobName === "store-original" && storeOriginal) {
      const result = await storeOriginal.execute({ photoId: String(payload.photoId) });
      if (result.isFailure) console.error(`  long-term storage: ${result.getError().message}`);
      else if (result.getValue() === "stored")
        console.log(`  long-term storage: original ${String(payload.photoId).slice(0, 8)} stored`);
      return;
    }
    if (!promoteSelected) return;
    let result;
    if (jobName === "promote-selected") {
      result = await promoteSelected.execute({ albumId: String(payload.albumId) });
    } else if (jobName === "promote-picked") {
      result = await promoteSelected.executePicked({ projectId: String(payload.projectId) });
    } else {
      return;
    }
    if (result.isSuccess) {
      const { promoted, alreadyStored } = result.getValue();
      console.log(`  long-term storage: ${promoted} originals promoted, ${alreadyStored} already stored`);
    } else {
      console.error(`  long-term storage: ${result.getError().message}`);
    }
  });
  queue.on(QUEUES.albumExport, async (_jobName, payload) => {
    const result = await runExport.execute(String(payload.exportJobId));
    if (result.isSuccess) console.log(`  export ${result.getValue().status}`);
  });

  // --- demo data ---------------------------------------------------------
  const studio = Studio.reconstitute(
    {
      name: "Golden Hour Photography",
      // Where the demo studio's notification emails go. Set DEMO_OWNER_EMAIL to receive them in a real inbox.
      ownerEmail: process.env.DEMO_OWNER_EMAIL || "studio@example.com",
      apiKeyHash: hashApiKey(DEMO_API_KEY),
      createdAt: new Date(),
    },
    UniqueEntityId.create(DEMO_STUDIO_ID),
  );
  await repos.studios.save(studio);

  const subscription = Subscription.startTrial(studio.id);
  subscription.changePlan("STUDIO");
  await repos.subscriptions.save(subscription);

  await repos.members.save(
    StudioMember.invite({
      studioId: studio.id,
      email: studio.ownerEmail,
      name: "Studio Owner",
      role: "OWNER",
    }),
  );

  await repos.projects.save(
    Project.create(
      {
        studioId: studio.id,
        name: "Demo shoot (sample data)",
        type: "WEDDING",
        eventDate: new Date("2026-06-20"),
      },
      UniqueEntityId.create(DEMO_PROJECT_ID),
    ),
  );

  // --- http --------------------------------------------------------------
  // Uploads land on this server in demo mode instead of going straight to S3, so the
  // body limit has to clear the contract's per-file ceiling. Fastify defaults to 1MB,
  // which every real camera file exceeds.
  const app = Fastify({ ...httpServerOptions(undefined), bodyLimit: MAX_UPLOAD_BYTES + 1024 * 1024 });
  // Demo mode shows the real failure message in the browser, which production never does.
  registerHttpFoundation(app, { logger, metrics: application.requestMetrics, exposeInternalErrors: true });
  await app.register(cors, { origin: WEB_ORIGIN, exposedHeaders: [REQUEST_ID_HEADER] });

  app.addContentTypeParser(UPLOADABLE_TYPES, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.get("/health", async () => ({ status: "ok", mode: "demo" }));

  // Stands in for S3 over HTTP so the browser can upload and load previews.
  app.put("/dev-storage/*", async (request, reply) => {
    const key = decodeURIComponent((request.params as Record<string, string>)["*"] ?? "");
    const body = request.body as Buffer;
    if (!Buffer.isBuffer(body)) {
      return reply.code(400).send({ message: "Expected a binary body." });
    }
    await blobs.put(key, body, request.headers["content-type"] ?? "application/octet-stream");
    return reply.code(200).send({ ok: true });
  });

  app.get("/dev-storage/*", async (request, reply) => {
    const key = decodeURIComponent((request.params as Record<string, string>)["*"] ?? "");
    const blob = blobs.get(key);
    if (!blob) return reply.code(404).send({ message: "Not found" });
    return reply
      .header("Content-Type", blob.contentType)
      .header("Cache-Control", "private, max-age=3600")
      .send(Buffer.from(blob.bytes));
  });

  registerStudioAuth(app, repos.studios, DEMO_JWT_SECRET, { publicPrefixes: ["/dev-storage/"] });
  registerTenancyGuard(app, infra.resourceOwnership);

  if (permanentStorage) registerMediaRoutes(app, { signer: mediaUrlSigner, provider: permanentStorage });

  const emailIncomplete = process.env.EMAIL_PROVIDER === "smtp" && emailSender.id !== "smtp";
  console.log(
    `  email      ${
      emailSender.id === "smtp"
        ? `SMTP (real mail via ${process.env.SMTP_HOST})`
        : emailIncomplete
          ? "logged only — EMAIL_PROVIDER=smtp but SMTP_HOST, MAIL_FROM (and SMTP_PASSWORD, if SMTP_USER is set) are not all filled in .env"
          : "logged only — set EMAIL_PROVIDER=smtp to send"
    }`,
  );
  // In demo mode ADMIN_EMAILS works the same way; sign up with one of them to see /admin.
  registerApplicationRoutes(app, application);

  // No worker in demo mode: the unconfirmed-signup sweep runs on a timer in this process.
  setInterval(
    () =>
      void application.purgeUnconfirmedSignups
        .execute()
        .catch((error: unknown) => logger.warn("unconfirmed-signup sweep failed", { err: error }))
        .then(() => application.errorInbox.purgeExpired()),
    60 * 60 * 1000,
  ).unref();

  await app.listen({ port: PORT, host: "0.0.0.0" });

  console.log(`
AlbumFlow demo API — everything in memory, nothing persisted.

  API        ${BASE_URL}
  Studio app ${WEB_ORIGIN}
  API key    ${DEMO_API_KEY}

Analysis and PDF export run inline instead of on a queue, so uploads take a
moment and export blocks for a few seconds. Restarting wipes all data.

Drop a folder of real JPEGs on the project page — the scoring is genuine, so
real photographs demo it far better than synthetic ones.
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
