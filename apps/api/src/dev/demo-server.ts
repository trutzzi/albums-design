import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { MAX_UPLOAD_BYTES } from "@albumflow/contracts";

import { registerStudioAuth } from "../interface/auth";
import { clientErrorFrom } from "../shared-kernel/errors";
import { registerTenancyGuard } from "../interface/tenancy";
import { registerIdentityRoutes } from "../modules/identity/interface/http/routes";
import { registerMediaIngestionRoutes } from "../modules/media-ingestion/interface/http/routes";
import { registerPhotoIntelligenceRoutes } from "../modules/photo-intelligence/interface/http/routes";
import { registerAlbumCompositionRoutes } from "../modules/album-composition/interface/http/routes";
import { registerReviewRoutes } from "../modules/review-collaboration/interface/http/routes";
import { registerPickRoutes } from "../modules/review-collaboration/interface/http/pick-routes";
import { registerDownloadRoutes } from "../modules/review-collaboration/interface/http/download-routes";
import { CompositePickNotifier, IdentityStudioContacts, MediaIngestionDeliveryGateway } from "../modules/review-collaboration/infrastructure/gateways/delivery-gateway";
import { ClientInvitationMailer } from "../modules/review-collaboration/application/services/client-invitation.mailer";
import { ClientLinkInvitations } from "../modules/review-collaboration/application/services/client-link-invitations";
import { ProjectClientContactDirectory } from "../modules/review-collaboration/infrastructure/gateways/client-contact-gateway";
import { StudioEmailNotifier } from "../modules/review-collaboration/application/services/studio-email-notifier";
import { DownloadSessionAdminUseCase } from "../modules/review-collaboration/application/use-cases/download-session-admin.use-case";
import { DownloadPortalUseCase } from "../modules/review-collaboration/application/use-cases/download-portal.use-case";
import { ReviewCollaborationDownloadHolds } from "../modules/media-ingestion/infrastructure/gateways/download-hold-gateway";
import { ClientAccessService } from "../modules/review-collaboration/application/services/client-access.service";
import { ReviewAccessUseCase } from "../modules/review-collaboration/application/use-cases/review-access.use-case";
import { SecretBox } from "../shared-kernel/secret-box";
import { ClientGrantSigner } from "../shared-kernel/client-grant";
import { SmtpEmailSender } from "../infrastructure/email/smtp-email-sender";
import { LoggingEmailSender } from "../infrastructure/email/logging-email-sender";
import { LoggingPickNotifier, MediaIngestionPickGateway } from "../modules/review-collaboration/infrastructure/gateways/pick-gateway";
import { PromoteOnPickNotifier } from "../modules/review-collaboration/infrastructure/gateways/promote-on-pick-notifier";
import { PickSessionAdminUseCase } from "../modules/review-collaboration/application/use-cases/open-pick-session.use-case";
import { PickPortalUseCase } from "../modules/review-collaboration/application/use-cases/pick-portal.use-case";
import { ReviewCollaborationClientPickDirectory } from "../modules/media-ingestion/infrastructure/gateways/client-pick-gateway";
import { registerExportRoutes } from "../modules/export-print/interface/http/routes";

import { Studio, hashApiKey } from "../modules/identity/domain/studio";
import { StudioMember } from "../modules/identity/domain/studio-member";
import { Subscription } from "../modules/identity/domain/subscription";
import { Project } from "../modules/media-ingestion/domain/project";
import { StudioAdministrationUseCase } from "../modules/identity/application/use-cases/studio-administration.use-case";
import { RegisterUseCase } from "../modules/identity/application/use-cases/register.use-case";
import { LoginUseCase } from "../modules/identity/application/use-cases/login.use-case";
import { SubscriptionQuotaPolicy } from "../modules/identity/application/subscription-quota-policy";
import { RequestUploadUseCase } from "../modules/media-ingestion/application/use-cases/request-upload/request-upload.use-case";
import { AbandonUploadUseCase } from "../modules/media-ingestion/application/use-cases/abandon-upload/abandon-upload.use-case";
import { ConfirmUploadUseCase } from "../modules/media-ingestion/application/use-cases/confirm-upload/confirm-upload.use-case";
import { ListProjectPhotosUseCase } from "../modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { DeleteProjectUseCase } from "../modules/media-ingestion/application/use-cases/delete-project/delete-project.use-case";
import { GenerateDerivativesUseCase } from "../modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { SharpImageResizer } from "../modules/media-ingestion/infrastructure/imaging/sharp-image-resizer";
import { MediaIngestionPhotoLifecycle } from "../modules/photo-intelligence/infrastructure/gateways/photo-lifecycle-gateway";
import { AnalyzePhotoUseCase } from "../modules/photo-intelligence/application/use-cases/analyze-photo/analyze-photo.use-case";
import { SharpImageInspector } from "../modules/photo-intelligence/infrastructure/vision/sharp-image-inspector";
import { buildVisionClassifier } from "../modules/photo-intelligence/infrastructure/vision/build-vision-classifier";
import { HeuristicVisionClassifier } from "../modules/photo-intelligence/infrastructure/vision/heuristic-vision-classifier";
import { GenerateAlbumUseCase } from "../modules/album-composition/application/use-cases/generate-album/generate-album.use-case";
import { SuggestLayoutsUseCase } from "../modules/album-composition/application/use-cases/suggest-layouts/suggest-layouts.use-case";
import { EditAlbumUseCase } from "../modules/album-composition/application/use-cases/edit-album/edit-album.use-case";
import { DeleteAlbumUseCase } from "../modules/album-composition/application/use-cases/delete-album/delete-album.use-case";
import {
  MediaIngestionProjectDirectory,
  PhotoIntelligenceDirectory,
} from "../modules/album-composition/infrastructure/gateways/directories";
import { OpenReviewSessionUseCase } from "../modules/review-collaboration/application/use-cases/open-review-session.use-case";
import { ReviewPortalUseCase } from "../modules/review-collaboration/application/use-cases/review-portal.use-case";
import { AlbumFeedbackUseCase } from "../modules/review-collaboration/application/use-cases/album-feedback.use-case";
import {
  AlbumCompositionGateway,
  LoggingReviewNotifier,
} from "../modules/review-collaboration/infrastructure/gateways/album-gateway";
import { StoragePhotoPreviewResolver } from "../modules/review-collaboration/infrastructure/gateways/photo-preview-resolver";
import { RequestExportUseCase } from "../modules/export-print/application/use-cases/request-export.use-case";
import { DeleteExportUseCase } from "../modules/export-print/application/use-cases/delete-export.use-case";
import { RunExportUseCase } from "../modules/export-print/application/use-cases/run-export.use-case";
import {
  AlbumCompositionExportGateway,
  StoredPhotoResolver,
} from "../modules/export-print/infrastructure/gateways/album-gateway";
import { PdfAlbumRenderer } from "../modules/export-print/infrastructure/rendering/pdf-album-renderer";
import { QUEUES } from "../shared-kernel/job-queue";

import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryPhotoAnalysisRepository,
  InMemoryPhotoRepository,
  InMemoryProjectRepository,
  InMemoryDownloadSessionRepository,
  InMemoryPickSessionRepository,
  InMemoryReviewSessionRepository,
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
} from "./in-memory-adapters";
import { LocalBlobStore } from "./local-blob-store";
import { SynchronousJobQueue } from "./synchronous-job-queue";
import { acceptEmptyJsonBody } from "../interface/empty-body";
import { registerMediaRoutes } from "../interface/media-routes";
import { MediaUrlSigner } from "../infrastructure/storage/media-url-signer";
import { DigiStorageProvider } from "../infrastructure/storage/digistorage-storage-provider";
import { TieredPhotoByteSource } from "../infrastructure/storage/tiered-photo-byte-source";
import { InMemoryStorageProvider } from "./in-memory-storage-provider";
import { StoreOriginalUseCase } from "../modules/media-ingestion/application/use-cases/store-original/store-original.use-case";
import { PromoteSelectedPhotosUseCase } from "../modules/media-ingestion/application/use-cases/promote-selected/promote-selected.use-case";
import { AlbumCompositionPlacementDirectory } from "../modules/media-ingestion/infrastructure/gateways/album-placement-gateway";
import { PromoteOnApprovalNotifier } from "../modules/review-collaboration/infrastructure/gateways/promote-on-approval-notifier";
import type { StorageProvider } from "../shared-kernel/storage-provider";

const PORT = Number(process.env.PORT ?? 4000);
const BASE_URL = process.env.DEMO_BASE_URL ?? `http://localhost:${PORT}`;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";
// Demo mode still honours VISION_PROVIDER, so the local Ollama setup can be
// tried against the demo app without needing the full Postgres/MinIO stack.
const VISION_PROVIDER = (process.env.VISION_PROVIDER ?? "heuristic") as
  | "heuristic"
  | "anthropic"
  | "ollama";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b";
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

async function main() {
  const studios = new InMemoryStudioRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const members = new InMemoryStudioMemberRepository();
  const projects = new InMemoryProjectRepository();
  const photos = new InMemoryPhotoRepository();
  const analyses = new InMemoryPhotoAnalysisRepository();
  const albums = new InMemoryAlbumRepository();
  const reviewSessions = new InMemoryReviewSessionRepository();
  const pickSessions = new InMemoryPickSessionRepository();
  const downloadSessions = new InMemoryDownloadSessionRepository();
  const exportJobs = new InMemoryExportJobRepository();

  const storage = new LocalBlobStore(BASE_URL);
  const queue = new SynchronousJobQueue();
  const clientAccess = new ClientAccessService(new SecretBox(DEMO_JWT_SECRET), new ClientGrantSigner(DEMO_JWT_SECRET));

  const administration = new StudioAdministrationUseCase(studios, subscriptions, members);
  const register = new RegisterUseCase(studios, subscriptions, members, DEMO_JWT_SECRET);
  const login = new LoginUseCase(members, DEMO_JWT_SECRET);
  const quota = new SubscriptionQuotaPolicy(subscriptions);

  const visionClassifier = buildVisionClassifier({
    provider: VISION_PROVIDER,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: OLLAMA_BASE_URL,
    ollamaModel: OLLAMA_MODEL,
  });
  const mediaUrlSigner = new MediaUrlSigner(DEMO_JWT_SECRET, BASE_URL);
  let permanentStorage: StorageProvider | undefined;
  if (STORAGE_PROVIDER === "memory") {
    permanentStorage = new InMemoryStorageProvider(mediaUrlSigner);
  } else if (STORAGE_PROVIDER === "digistorage") {
    const { DIGISTORAGE_WEBDAV_URL, DIGISTORAGE_USERNAME, DIGISTORAGE_APP_PASSWORD } = process.env;
    if (!DIGISTORAGE_WEBDAV_URL || !DIGISTORAGE_USERNAME || !DIGISTORAGE_APP_PASSWORD) {
      throw new Error(
        "STORAGE_PROVIDER=digistorage needs DIGISTORAGE_WEBDAV_URL, DIGISTORAGE_USERNAME and DIGISTORAGE_APP_PASSWORD.",
      );
    }
    permanentStorage = new DigiStorageProvider({
      webdavUrl: DIGISTORAGE_WEBDAV_URL,
      username: DIGISTORAGE_USERNAME,
      appPassword: DIGISTORAGE_APP_PASSWORD,
      rootPath: process.env.DIGISTORAGE_ROOT_PATH ?? "albumflow-demo",
      urlSigner: mediaUrlSigner,
    });
  }
  // Same switch as production: with a long-term provider, every upload is copied there too.
  const storeEverything = Boolean(permanentStorage) && (process.env.LONG_TERM_ORIGINALS ?? "all") === "all";
  const storeOriginal = permanentStorage ? new StoreOriginalUseCase(photos, storage, permanentStorage) : undefined;
  const promoteSelected = permanentStorage
    ? new PromoteSelectedPhotosUseCase(
        photos,
        storage,
        permanentStorage,
        new AlbumCompositionPlacementDirectory(albums),
        undefined,
        new ReviewCollaborationClientPickDirectory(pickSessions),
      )
    : undefined;

  const analyzePhoto = new AnalyzePhotoUseCase(
    analyses,
    storage,
    new SharpImageInspector(),
    new HeuristicVisionClassifier(),
    visionClassifier,
    new MediaIngestionPhotoLifecycle(photos),
  );

  const reviewGateway = new AlbumCompositionGateway(
    albums,
    new StoragePhotoPreviewResolver(photos, storage, permanentStorage),
  );
  const exportGateway = new AlbumCompositionExportGateway(albums);
  const runExport = new RunExportUseCase(
    exportJobs,
    exportGateway,
    new PdfAlbumRenderer(
      new StoredPhotoResolver(
        photos,
        permanentStorage ? new TieredPhotoByteSource(storage, permanentStorage) : storage,
      ),
    ),
    storage,
  );

  const generateDerivatives = new GenerateDerivativesUseCase(
    photos,
    storage,
    new SharpImageResizer(),
    permanentStorage,
  );

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
      else if (result.getValue() === "stored") console.log(`  long-term storage: original ${String(payload.photoId).slice(0, 8)} stored`);
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
  await studios.save(studio);

  const subscription = Subscription.startTrial(studio.id);
  subscription.changePlan("STUDIO");
  await subscriptions.save(subscription);

  await members.save(
    StudioMember.invite({
      studioId: studio.id,
      email: studio.ownerEmail,
      name: "Studio Owner",
      role: "OWNER",
    }),
  );

  await projects.save(
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
  const app = Fastify({ logger: false, bodyLimit: MAX_UPLOAD_BYTES + 1024 * 1024 });
  acceptEmptyJsonBody(app);
  await app.register(cors, { origin: WEB_ORIGIN });

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
    await storage.put(key, body, request.headers["content-type"] ?? "application/octet-stream");
    return reply.code(200).send({ ok: true });
  });

  app.get("/dev-storage/*", async (request, reply) => {
    const key = decodeURIComponent((request.params as Record<string, string>)["*"] ?? "");
    const blob = storage.get(key);
    if (!blob) return reply.code(404).send({ message: "Not found" });
    return reply
      .header("Content-Type", blob.contentType)
      .header("Cache-Control", "private, max-age=3600")
      .send(Buffer.from(blob.bytes));
  });

  registerStudioAuth(app, studios, DEMO_JWT_SECRET, { publicPrefixes: ["/dev-storage/"] });
  registerTenancyGuard(app, { projects, photos, albums, exportJobs });

  if (permanentStorage) registerMediaRoutes(app, { signer: mediaUrlSigner, provider: permanentStorage });

  registerIdentityRoutes(app, { administration, register, login });
  registerMediaIngestionRoutes(app, {
    requestUpload: new RequestUploadUseCase(projects, photos, storage),
    confirmUpload: new ConfirmUploadUseCase(photos, storage, queue, storeEverything),
    abandonUpload: new AbandonUploadUseCase(photos, storage),
    listProjectPhotos: new ListProjectPhotosUseCase(photos, storage, permanentStorage),
    deleteProject: new DeleteProjectUseCase(
      projects,
      photos,
      storage,
      analyses,
      albums,
      exportJobs,
      storage,
      reviewSessions,
      permanentStorage,
      pickSessions,
      downloadSessions,
    ),
    projects,
  });
  registerPhotoIntelligenceRoutes(app, { analyses, visionClassifier });
  registerAlbumCompositionRoutes(app, {
    suggestLayouts: new SuggestLayoutsUseCase(new PhotoIntelligenceDirectory(analyses)),
    generateAlbum: new GenerateAlbumUseCase(
      albums,
      new MediaIngestionProjectDirectory(projects),
      new PhotoIntelligenceDirectory(analyses),
      quota,
    ),
    editAlbum: new EditAlbumUseCase(albums),
    deleteAlbum: new DeleteAlbumUseCase(albums, exportJobs, storage, reviewSessions),
    albums,
  });
  // Real mail when SMTP_* is set for the demo, otherwise the message is printed in this log.
  const emailSender =
    process.env.EMAIL_PROVIDER === "smtp" &&
    process.env.SMTP_HOST &&
    process.env.MAIL_FROM &&
    // A login with no password can only fail, and mail servers lock out repeated failures.
    !(process.env.SMTP_USER && !process.env.SMTP_PASSWORD)
      ? new SmtpEmailSender({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === "true",
          user: process.env.SMTP_USER || undefined,
          password: process.env.SMTP_PASSWORD || undefined,
          from: process.env.MAIL_FROM,
        })
      : new LoggingEmailSender();
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
  const studioContacts = new IdentityStudioContacts(projects, members, studios);
  const clientContacts = new ProjectClientContactDirectory(projects, albums);
  const invitations = new ClientLinkInvitations(
    new ClientInvitationMailer(emailSender),
    clientContacts,
    studioContacts,
    process.env.WEB_ORIGIN ?? "http://localhost:5173",
  );
  const studioEmail = new StudioEmailNotifier(
    emailSender,
    studioContacts,
    process.env.WEB_ORIGIN ?? "http://localhost:5173",
  );
  const loggedAndEmailed = new CompositePickNotifier([new LoggingPickNotifier(), studioEmail]);

  registerReviewRoutes(app, {
    openReviewSession: new OpenReviewSessionUseCase(
      reviewSessions,
      reviewGateway,
      clientAccess,
      invitations,
      clientContacts,
    ),
    reviewPortal: new ReviewPortalUseCase(
      reviewSessions,
      reviewGateway,
      permanentStorage
        ? new PromoteOnApprovalNotifier(new LoggingReviewNotifier(), queue)
        : new LoggingReviewNotifier(),
      clientAccess,
    ),
    albumFeedback: new AlbumFeedbackUseCase(reviewSessions),
    sessions: reviewSessions,
    reviewAccess: new ReviewAccessUseCase(reviewSessions, clientAccess, invitations, clientContacts),
  });
  const pickGateway = new MediaIngestionPickGateway(
    projects,
    photos,
    new ListProjectPhotosUseCase(photos, storage, permanentStorage),
  );
  registerPickRoutes(app, {
    pickAdmin: new PickSessionAdminUseCase(pickSessions, pickGateway, clientAccess, invitations, clientContacts),
    pickPortal: new PickPortalUseCase(
      pickSessions,
      pickGateway,
      permanentStorage ? new PromoteOnPickNotifier(loggedAndEmailed, queue) : loggedAndEmailed,
      clientAccess,
    ),
  });
  const deliveryGateway = new MediaIngestionDeliveryGateway(projects, photos, storage, permanentStorage);
  registerDownloadRoutes(app, {
    downloadAdmin: new DownloadSessionAdminUseCase(
      downloadSessions,
      deliveryGateway,
      () => new Date(),
      clientAccess,
      invitations,
      clientContacts,
    ),
    downloadPortal: new DownloadPortalUseCase(
      downloadSessions,
      deliveryGateway,
      studioEmail,
      console.error,
      () => new Date(),
      clientAccess,
      pickGateway,
    ),
  });
  registerExportRoutes(app, {
    requestExport: new RequestExportUseCase(exportJobs, exportGateway, queue),
    deleteExport: new DeleteExportUseCase(exportJobs, storage),
    jobs: exportJobs,
    storage,
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
    console.error(error);
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return reply.code(500).send({ code: "INTERNAL_ERROR", message });
  });

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
