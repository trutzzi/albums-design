import { S3Client } from "@aws-sdk/client-s3";
import type { ConnectionOptions } from "bullmq";
import type { Env } from "../shared-kernel/env";
import type { Logger } from "../shared-kernel/logger";
import { createDatabase } from "../db/client";
import { createPinoLogger, PinoLogger } from "../infrastructure/logging/pino-logger";
import { ErrorReportingLogger } from "../infrastructure/monitoring/error-reporting-logger";
import { ErrorRecordingLogger } from "../infrastructure/monitoring/error-recording-logger";
import { DrizzleErrorLogRepository } from "../modules/platform-admin/infrastructure/error-log-repositories";
import { buildEmailSender } from "../infrastructure/email/build-email-sender";
import { buildStorage } from "../infrastructure/storage/build-storage-provider";
import { OffsiteDatabaseBackups } from "../infrastructure/backup/offsite-database-backups";
import { S3ObjectStorage } from "../modules/media-ingestion/infrastructure/storage/s3-object-storage";
import { BullMqJobQueue } from "../modules/media-ingestion/infrastructure/queue/bullmq-job-queue";
import { S3PhotoByteSource } from "../modules/photo-intelligence/infrastructure/storage/s3-photo-byte-source";
import { S3ExportStorage } from "../modules/export-print/infrastructure/storage/s3-export-storage";
import { DrizzleStatsSource } from "../modules/platform-admin/infrastructure/stats-sources";
import { LiveDependencyProbe } from "../modules/platform-admin/infrastructure/dependency-probes";
import { DrizzleResourceOwnership } from "../infrastructure/persistence/drizzle-resource-ownership";
import { buildBillingGateway } from "../infrastructure/billing/build-billing-gateway";
import { QUEUES } from "../shared-kernel/job-queue";
import type { ModuleInfrastructure } from "./ports";

export function redisConnectionFrom(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}

/**
 * The process-wide adapters every module shares: logging, the database, object storage,
 * the queue and outbound email. Built once per process; nothing here knows about a use case.
 * The production family of `ModuleInfrastructure` — the demo's is `buildInMemoryAdapters`.
 */
export function buildInfrastructure(env: Env, service: "api" | "worker") {
  const { db, close: closeDb } = createDatabase(env.DATABASE_URL);
  const pinoLogger = createPinoLogger({ service, level: env.LOG_LEVEL, environment: env.NODE_ENV });
  const errorLog = new DrizzleErrorLogRepository(db);
  // Every `error` entry is also kept in the admin error log and sent to Sentry; classes log
  // through the port and never see either.
  const logger: Logger = new ErrorReportingLogger(
    new ErrorRecordingLogger(new PinoLogger(pinoLogger), errorLog, service),
  );

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
  const presignS3 = env.S3_PUBLIC_ENDPOINT ? new S3Client({ ...s3Config, endpoint: env.S3_PUBLIC_ENDPOINT }) : s3;
  const storage = new S3ObjectStorage({
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  const redisConnection = redisConnectionFrom(env.REDIS_URL);
  const jobQueue = new BullMqJobQueue(redisConnection);

  // Long-term tier. Absent unless configured, in which case every consumer
  // behaves exactly as it did before this tier existed.
  const { provider: permanentStorage, signer: mediaUrlSigner } = buildStorage(env);

  const infrastructure = {
    env,
    logger,
    pinoLogger,
    db,
    closeDb,
    s3,
    presignS3,
    storage,
    redisConnection,
    jobQueue,
    errorLog,
    permanentStorage,
    mediaUrlSigner,
    emailSender: buildEmailSender(env, logger.child({ component: "email" })),
    /** Reads originals from the staging bucket (analysis, PDF rendering). */
    byteSource: new S3PhotoByteSource(s3, env.S3_BUCKET),
    /** Copies database dumps off the server. Needs both BACKUP_DIR and a long-term provider. */
    offsiteBackups:
      permanentStorage && env.BACKUP_DIR
        ? new OffsiteDatabaseBackups(permanentStorage, env.BACKUP_DIR, env.BACKUP_KEEP)
        : undefined,
    exportStorage: new S3ExportStorage(s3, env.S3_BUCKET, presignS3),
    billingGateway: buildBillingGateway(env),
    statsSource: new DrizzleStatsSource(db),
    dependencyProbe: new LiveDependencyProbe(db, () => jobQueue.counts(Object.values(QUEUES))),
    systemConfig: {
      mode: "production" as const,
      storage: env.STORAGE_PROVIDER,
      email: env.EMAIL_PROVIDER,
      billing: env.BILLING_PROVIDER,
      vision: env.VISION_PROVIDER,
      errorMonitoring: Boolean(env.SENTRY_DSN),
    },
    resourceOwnership: new DrizzleResourceOwnership(db),
  };
  // Production extras (the database handle, Redis, pino) ride along; the modules see only the ports.
  return infrastructure satisfies ModuleInfrastructure;
}

export type Infrastructure = ReturnType<typeof buildInfrastructure>;
