import * as Sentry from "@sentry/node";

let enabled = false;

/**
 * Sends unexpected failures (a 500 from the API, a failed worker job, an unhandled
 * rejection) to Sentry, so a broken upload or export on production is seen before a
 * photographer has to report it. Does nothing without SENTRY_DSN, which keeps local
 * runs, tests and demo mode free of it.
 */
export function startErrorMonitoring(options: {
  dsn: string | undefined;
  environment: string;
  service: "api" | "worker";
}): boolean {
  if (!options.dsn || enabled) return enabled;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    initialScope: { tags: { service: options.service } },
    // Errors only: no performance tracing, so nothing is sampled per request.
    tracesSampleRate: 0,
    // Request bodies can hold client names and passwords; Sentry gets the error, not the payload.
    sendDefaultPii: false,
  });
  enabled = true;
  return true;
}

export function reportError(error: unknown, context?: Record<string, string | number | undefined>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Lets queued reports reach Sentry before the process exits. */
export async function flushErrorReports(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.flush(timeoutMs);
}
