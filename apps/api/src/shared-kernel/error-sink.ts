/** Which process an error happened in. */
export type ErrorSource = "api" | "worker";

/** A field kept with an error for the admin's eyes: flat, JSON-safe and already redacted. */
export type ErrorContextValue = string | number | boolean | null;

/** One error-level log entry, as the admin error log records it. */
export interface ErrorEvent {
  source: ErrorSource;
  /** What the code was doing — the log message, e.g. "request failed". */
  title: string;
  /** The thrown error's class name, when there was one. */
  errorType: string | null;
  errorMessage: string | null;
  /** Stack trace, with any `cause` chain appended. */
  stack: string | null;
  /** Where it happened: "GET /review/:token", "storage › store-original", or the logging component. */
  location: string | null;
  /** The `x-request-id` of the HTTP request it failed, so a report can be looked up. */
  requestId: string | null;
  context: Record<string, ErrorContextValue>;
  occurredAt: Date;
}

/** Where error-level log entries are kept for the admin error log. */
export interface ErrorSink {
  record(event: ErrorEvent): Promise<void>;
}
