import { S3Client } from "@aws-sdk/client-s3";
import type { ConnectionOptions } from "bullmq";
import { loadEnv, type Env } from "./shared-kernel/env";
import { createDatabase, type Database } from "./db/client";

import {
  DrizzleStudioMemberRepository,
  DrizzleStudioRepository,
  DrizzleSubscriptionRepository,
} from "./modules/identity/infrastructure/persistence/drizzle-studio-repository";
import { StudioAdministrationUseCase } from "./modules/identity/application/use-cases/studio-administration.use-case";
import { SubscriptionQuotaPolicy } from "./modules/identity/application/subscription-quota-policy";

import { DrizzleProjectRepository } from "./modules/media-ingestion/infrastructure/persistence/drizzle-project-repository";
import { DrizzlePhotoRepository } from "./modules/media-ingestion/infrastructure/persistence/drizzle-photo-repository";
import { S3ObjectStorage } from "./modules/media-ingestion/infrastructure/storage/s3-object-storage";
import { BullMqJobQueue } from "./modules/media-ingestion/infrastructure/queue/bullmq-job-queue";
import { RequestUploadUseCase } from "./modules/media-ingestion/application/use-cases/request-upload/request-upload.use-case";
import { ConfirmUploadUseCase } from "./modules/media-ingestion/application/use-cases/confirm-upload/confirm-upload.use-case";
import { ListProjectPhotosUseCase } from "./modules/media-ingestion/application/use-cases/list-project-photos/list-project-photos.use-case";
import { GenerateDerivativesUseCase } from "./modules/media-ingestion/application/use-cases/generate-derivatives/generate-derivatives.use-case";
import { SharpImageResizer } from "./modules/media-ingestion/infrastructure/imaging/sharp-image-resizer";
import type { MediaIngestionDependencies } from "./modules/media-ingestion/interface/http/routes";

import { DrizzlePhotoAnalysisRepository } from "./modules/photo-intelligence/infrastructure/persistence/drizzle-photo-analysis-repository";
import { SharpImageInspector } from "./modules/photo-intelligence/infrastructure/vision/sharp-image-inspector";
import { HeuristicVisionClassifier } from "./modules/photo-intelligence/infrastructure/vision/heuristic-vision-classifier";
import { AnthropicVisionClassifier } from "./modules/photo-intelligence/infrastructure/vision/anthropic-vision-classifier";
import { S3PhotoByteSource } from "./modules/photo-intelligence/infrastructure/storage/s3-photo-byte-source";
import { MediaIngestionPhotoLifecycle } from "./modules/photo-intelligence/infrastructure/gateways/photo-lifecycle-gateway";
import { AnalyzePhotoUseCase } from "./modules/photo-intelligence/application/use-cases/analyze-photo/analyze-photo.use-case";
import type { VisionClassifier } from "./modules/photo-intelligence/application/ports/vision-classifier";

import { DrizzleAlbumRepository } from "./modules/album-composition/infrastructure/persistence/drizzle-album-repository";
import {
  MediaIngestionProjectDirectory,
  PhotoIntelligenceDirectory,
} from "./modules/album-composition/infrastructure/gateways/directories";
import { GenerateAlbumUseCase } from "./modules/album-composition/application/use-cases/generate-album/generate-album.use-case";
import { SuggestLayoutsUseCase } from "./modules/album-composition/application/use-cases/suggest-layouts/suggest-layouts.use-case";
import { EditAlbumUseCase } from "./modules/album-composition/application/use-cases/edit-album/edit-album.use-case";

import { DrizzleReviewSessionRepository } from "./modules/review-collaboration/infrastructure/persistence/drizzle-review-session-repository";
import {
  AlbumCompositionGateway,
  LoggingReviewNotifier,
} from "./modules/review-collaboration/infrastructure/gateways/album-gateway";
import { StoragePhotoPreviewResolver } from "./modules/review-collaboration/infrastructure/gateways/photo-preview-resolver";
import { OpenReviewSessionUseCase } from "./modules/review-collaboration/application/use-cases/open-review-session.use-case";
import { ReviewPortalUseCase } from "./modules/review-collaboration/application/use-cases/review-portal.use-case";
import { AlbumFeedbackUseCase } from "./modules/review-collaboration/application/use-cases/album-feedback.use-case";

import { DrizzleExportJobRepository } from "./modules/export-print/infrastructure/persistence/drizzle-export-job-repository";
import {
  AlbumCompositionExportGateway,
  StoredPhotoResolver,
} from "./modules/export-print/infrastructure/gateways/album-gateway";
import { PdfAlbumRenderer } from "./modules/export-print/infrastructure/rendering/pdf-album-renderer";
import { S3ExportStorage } from "./modules/export-print/infrastructure/storage/s3-export-storage";
import { RequestExportUseCase } from "./modules/export-print/application/use-cases/request-export.use-case";
import { RunExportUseCase } from "./modules/export-print/application/use-cases/run-export.use-case";

export interface CompositionRoot {
  env: Env;
  db: Database;
  studios: DrizzleStudioRepository;
  projects: DrizzleProjectRepository;
  photos: DrizzlePhotoRepository;
  administration: StudioAdministrationUseCase;
  mediaIngestion: MediaIngestionDependencies;
  generateDerivatives: GenerateDerivativesUseCase;
  analyses: DrizzlePhotoAnalysisRepository;
  analyzePhoto: AnalyzePhotoUseCase;
  albums: DrizzleAlbumRepository;
  suggestLayouts: SuggestLayoutsUseCase;
  generateAlbum: GenerateAlbumUseCase;
  editAlbum: EditAlbumUseCase;
  reviewSessions: DrizzleReviewSessionRepository;
  openReviewSession: OpenReviewSessionUseCase;
  reviewPortal: ReviewPortalUseCase;
  albumFeedback: AlbumFeedbackUseCase;
  exportJobs: DrizzleExportJobRepository;
  requestExport: RequestExportUseCase;
  runExport: RunExportUseCase;
  exportStorage: S3ExportStorage;
  shutdown: () => Promise<void>;
}

function redisConnectionFrom(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}

function buildVisionClassifier(env: Env): VisionClassifier {
  if (env.VISION_PROVIDER === "anthropic") {
    return new AnthropicVisionClassifier({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return new HeuristicVisionClassifier();
}

export function buildCompositionRoot(env: Env = loadEnv()): CompositionRoot {
  const { db, close: closeDb } = createDatabase(env.DATABASE_URL);

  const s3Config = {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  };
  const s3 = new S3Client(s3Config);
  const presignS3 = env.S3_PUBLIC_ENDPOINT
    ? new S3Client({ ...s3Config, endpoint: env.S3_PUBLIC_ENDPOINT })
    : s3;

  // Identity & billing
  const studios = new DrizzleStudioRepository(db);
  const subscriptions = new DrizzleSubscriptionRepository(db);
  const members = new DrizzleStudioMemberRepository(db);
  const administration = new StudioAdministrationUseCase(studios, subscriptions, members);
  const quotaPolicy = new SubscriptionQuotaPolicy(subscriptions);

  // Media ingestion
  const projects = new DrizzleProjectRepository(db);
  const photos = new DrizzlePhotoRepository(db);
  const storage = new S3ObjectStorage({
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  const jobQueue = new BullMqJobQueue(redisConnectionFrom(env.REDIS_URL));

  const generateDerivatives = new GenerateDerivativesUseCase(
    photos,
    storage,
    new SharpImageResizer(),
  );

  const mediaIngestion: MediaIngestionDependencies = {
    requestUpload: new RequestUploadUseCase(projects, photos, storage),
    confirmUpload: new ConfirmUploadUseCase(photos, storage, jobQueue),
    listProjectPhotos: new ListProjectPhotosUseCase(photos, storage),
    projects,
  };

  // Photo intelligence
  const analyses = new DrizzlePhotoAnalysisRepository(db);
  const byteSource = new S3PhotoByteSource(s3, env.S3_BUCKET);
  const analyzePhoto = new AnalyzePhotoUseCase(
    analyses,
    byteSource,
    new SharpImageInspector(),
    buildVisionClassifier(env),
    new MediaIngestionPhotoLifecycle(photos),
  );

  // Album composition
  const albums = new DrizzleAlbumRepository(db);
  const generateAlbum = new GenerateAlbumUseCase(
    albums,
    new MediaIngestionProjectDirectory(projects),
    new PhotoIntelligenceDirectory(analyses),
    quotaPolicy,
  );
  const editAlbum = new EditAlbumUseCase(albums);
  const suggestLayouts = new SuggestLayoutsUseCase(new PhotoIntelligenceDirectory(analyses));

  // Review & collaboration
  const reviewSessions = new DrizzleReviewSessionRepository(db);
  const reviewAlbumGateway = new AlbumCompositionGateway(
    albums,
    new StoragePhotoPreviewResolver(photos, storage),
  );
  const openReviewSession = new OpenReviewSessionUseCase(reviewSessions, reviewAlbumGateway);
  const albumFeedback = new AlbumFeedbackUseCase(reviewSessions);
  const reviewPortal = new ReviewPortalUseCase(
    reviewSessions,
    reviewAlbumGateway,
    new LoggingReviewNotifier(),
  );

  // Export & print
  const exportJobs = new DrizzleExportJobRepository(db);
  const exportAlbumGateway = new AlbumCompositionExportGateway(albums);
  const exportStorage = new S3ExportStorage(s3, env.S3_BUCKET, presignS3);
  const requestExport = new RequestExportUseCase(exportJobs, exportAlbumGateway, jobQueue);
  const runExport = new RunExportUseCase(
    exportJobs,
    exportAlbumGateway,
    new PdfAlbumRenderer(new StoredPhotoResolver(photos, byteSource)),
    exportStorage,
  );

  return {
    env,
    db,
    studios,
    projects,
    photos,
    administration,
    mediaIngestion,
    generateDerivatives,
    analyses,
    analyzePhoto,
    albums,
    suggestLayouts,
    generateAlbum,
    editAlbum,
    reviewSessions,
    openReviewSession,
    reviewPortal,
    albumFeedback,
    exportJobs,
    requestExport,
    runExport,
    exportStorage,
    shutdown: async () => {
      await Promise.all([closeDb(), jobQueue.close()]);
    },
  };
}
