import * as Sentry from "@sentry/react";

/**
 * Crashes in the browser (a blank editor, a failed render) reach Sentry when the
 * build has VITE_SENTRY_DSN. Without it nothing loads and nothing is sent.
 */
export function startErrorMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

export const ErrorBoundary = Sentry.ErrorBoundary;
