import type { ConnectionOptions } from "bullmq";
import type pino from "pino";
import { loadEnv, type Env } from "./shared-kernel/env";
import type { Logger } from "./shared-kernel/logger";
import type { StorageProvider } from "./shared-kernel/storage-provider";
import type { Database } from "./db/client";
import type { MediaUrlSigner } from "./infrastructure/storage/media-url-signer";
import type { OffsiteDatabaseBackups } from "./infrastructure/backup/offsite-database-backups";
import { buildInfrastructure } from "./composition/infrastructure";
import { buildRepositories } from "./composition/repositories";
import { buildApplication, type Application } from "./composition/application";

/** The production wiring: every use case (see `buildApplication`) plus what the API and worker processes run on. */
export interface CompositionRoot extends Application {
  env: Env;
  /** Application logger: structured, and every `error` entry also reaches Sentry. */
  logger: Logger;
  /** The same pino instance underneath, handed to Fastify so the access log shares its format and redaction. */
  pinoLogger: pino.Logger;
  /** BullMQ's view of REDIS_URL, for the worker's queues. */
  redisConnection: ConnectionOptions;
  db: Database;
  /** Long-term storage; `undefined` unless STORAGE_PROVIDER is configured. */
  permanentStorage: StorageProvider | undefined;
  mediaUrlSigner: MediaUrlSigner;
  /** Copies database dumps off the server. Needs both BACKUP_DIR and a long-term provider. */
  offsiteBackups: OffsiteDatabaseBackups | undefined;
  shutdown: () => Promise<void>;
}

export interface CompositionOptions {
  /** Which process is running, stamped on every log line and Sentry event. */
  service?: "api" | "worker";
}

/** The only place that knows the production adapters: Postgres, S3, BullMQ. */
export function buildCompositionRoot(env: Env = loadEnv(), options: CompositionOptions = {}): CompositionRoot {
  const infra = buildInfrastructure(env, options.service ?? "api");
  const repos = buildRepositories(infra.db);

  return {
    ...buildApplication(infra, repos),
    env,
    logger: infra.logger,
    pinoLogger: infra.pinoLogger,
    redisConnection: infra.redisConnection,
    db: infra.db,
    permanentStorage: infra.permanentStorage,
    mediaUrlSigner: infra.mediaUrlSigner,
    offsiteBackups: infra.offsiteBackups,
    shutdown: async () => {
      await Promise.all([infra.closeDb(), infra.jobQueue.close()]);
    },
  };
}
