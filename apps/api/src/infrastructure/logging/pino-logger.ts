import pino from "pino";
import type { LogContext, Logger } from "../../shared-kernel/logger";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

/** The public client links carry their share token as the path segment after the prefix. */
const TOKEN_PATH = /^\/(review|pick|download)\/[^/]+/;

/**
 * What a log line may show of a URL: never the query string (download grants, signed
 * media tokens) and never a client link's share token — the database keeps only its
 * hash, so a plaintext copy in the logs would be the weakest place it lives.
 */
export function redactUrl(url: string): string {
  const path = url.split("?")[0] ?? "";
  return path.replace(TOKEN_PATH, "/$1/[token]");
}

interface LoggedRequest {
  method: string;
  url: string;
  ip?: string;
  routeOptions?: { url?: string | undefined };
}

/**
 * One pino instance per process. Fastify takes it as its own logger, so the access log
 * and application entries share the same format, level and redaction.
 */
export function createPinoLogger(
  options: { service: string; level: LogLevel; environment: string },
  /** Where lines go; stdout by default. */
  destination?: pino.DestinationStream,
): pino.Logger {
  const settings: pino.LoggerOptions = {
    level: options.level,
    base: { service: options.service, env: options.environment },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    serializers: {
      // Replaces Fastify's default, which logs the raw URL.
      req: (request: LoggedRequest) => ({
        method: request.method,
        route: request.routeOptions?.url ?? "unmatched",
        url: redactUrl(request.url),
        remoteAddress: request.ip,
      }),
      err: pino.stdSerializers.errWithCause,
    },
    // Defence in depth: application code should never log these, but if it does they are masked.
    redact: {
      paths: [
        "password",
        "*.password",
        "token",
        "*.token",
        "grant",
        "*.grant",
        "apiKey",
        "*.apiKey",
        "authorization",
        "*.authorization",
        "headers.cookie",
        "*.headers.cookie",
      ],
      censor: "[redacted]",
    },
  };
  return destination ? pino(settings, destination) : pino(settings);
}

/** Adapts pino to the application's `Logger` port. */
export class PinoLogger implements Logger {
  constructor(private readonly pinoLogger: pino.Logger) {}

  debug(message: string, context?: LogContext): void {
    if (context) this.pinoLogger.debug(context, message);
    else this.pinoLogger.debug(message);
  }

  info(message: string, context?: LogContext): void {
    if (context) this.pinoLogger.info(context, message);
    else this.pinoLogger.info(message);
  }

  warn(message: string, context?: LogContext): void {
    if (context) this.pinoLogger.warn(context, message);
    else this.pinoLogger.warn(message);
  }

  error(message: string, context?: LogContext): void {
    if (context) this.pinoLogger.error(context, message);
    else this.pinoLogger.error(message);
  }

  child(bindings: LogContext): Logger {
    return new PinoLogger(this.pinoLogger.child(bindings));
  }
}
