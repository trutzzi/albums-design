import type { LogContext, Logger } from "../../shared-kernel/logger";
import { reportError } from "./error-monitoring";

/**
 * Decorates a logger so every `error` entry also reaches error monitoring: whatever a
 * class decides is a real failure is seen on Sentry without the class knowing Sentry
 * exists. `warn` and below stay in the log only — a degraded path that recovers on its
 * own is not an incident.
 */
export class ErrorReportingLogger implements Logger {
  constructor(
    private readonly inner: Logger,
    private readonly report: (error: unknown, context?: LogContext) => void = reportError,
    private readonly bindings: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    this.inner.debug(message, context);
  }

  info(message: string, context?: LogContext): void {
    this.inner.info(message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.inner.warn(message, context);
  }

  error(message: string, context?: LogContext): void {
    this.inner.error(message, context);
    const { err, ...rest } = context ?? {};
    // Without a thrown error, the message itself is the incident; a synthetic Error keeps Sentry grouping by it.
    this.report(err instanceof Error ? err : new Error(message), {
      ...this.bindings,
      ...rest,
      message,
      ...(err !== undefined && !(err instanceof Error) ? { err: String(err) } : {}),
    });
  }

  child(bindings: LogContext): Logger {
    return new ErrorReportingLogger(this.inner.child(bindings), this.report, { ...this.bindings, ...bindings });
  }
}
