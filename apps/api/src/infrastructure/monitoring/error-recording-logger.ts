import type { ErrorContextValue, ErrorEvent, ErrorSink, ErrorSource } from "../../shared-kernel/error-sink";
import type { LogContext, Logger } from "../../shared-kernel/logger";

/** Writes in flight before new ones are dropped: a database outage must not pile errors up in memory. */
const MAX_PENDING_WRITES = 50;
/** How often a failing error log may say so itself, so an outage does not double every log line. */
const FAILURE_WARNING_INTERVAL_MS = 60_000;
const MAX_STACK_LENGTH = 8000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_VALUE_LENGTH = 500;
const MAX_CONTEXT_FIELDS = 30;
/** Never kept, whatever a caller put in the context. */
const SECRET_KEY = /pass(word)?|token|grant|secret|authorization|cookie|api_?key/i;
/** Fields that become columns of their own rather than context. */
const PROMOTED = new Set(["err", "requestId"]);

/** One counter per process, shared by every child logger. */
interface WriteState {
  pending: number;
  dropping: boolean;
  lastFailureWarningAt: number;
}

/**
 * Decorates a logger so every `error` entry is also kept in the admin error log, where the
 * team can read it, search it by request id and mark it resolved. Recording happens in the
 * background: a request never waits on it, and a failed write is reported to the wrapped
 * logger only — never through `error`, which would record the failure to record.
 */
export class ErrorRecordingLogger implements Logger {
  constructor(
    private readonly inner: Logger,
    private readonly sink: ErrorSink,
    private readonly source: ErrorSource,
    private readonly bindings: LogContext = {},
    private readonly state: WriteState = { pending: 0, dropping: false, lastFailureWarningAt: 0 },
    private readonly now: () => Date = () => new Date(),
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
    this.capture(message, { ...this.bindings, ...context });
  }

  child(bindings: LogContext): Logger {
    return new ErrorRecordingLogger(
      this.inner.child(bindings),
      this.sink,
      this.source,
      { ...this.bindings, ...bindings },
      this.state,
      this.now,
    );
  }

  private capture(message: string, context: LogContext): void {
    if (this.state.pending >= MAX_PENDING_WRITES) {
      if (!this.state.dropping) {
        this.state.dropping = true;
        this.inner.warn("error log is falling behind; skipping entries until it catches up", {
          pending: this.state.pending,
        });
      }
      return;
    }
    const event = toErrorEvent(this.source, message, context, this.now());
    this.state.pending += 1;
    void this.sink
      .record(event)
      .catch((error: unknown) => {
        const at = Date.now();
        if (at - this.state.lastFailureWarningAt < FAILURE_WARNING_INTERVAL_MS) return;
        this.state.lastFailureWarningAt = at;
        this.inner.warn("could not write to the admin error log", { err: error });
      })
      .finally(() => {
        this.state.pending -= 1;
        if (this.state.pending === 0) this.state.dropping = false;
      });
  }
}

export function toErrorEvent(source: ErrorSource, title: string, context: LogContext, occurredAt: Date): ErrorEvent {
  const err = context["err"];
  const error = err instanceof Error ? err : undefined;
  return {
    source,
    title: truncate(title, 500),
    errorType: error ? error.name : err === undefined ? null : typeof err,
    errorMessage: err === undefined ? null : truncate(error ? error.message : String(err), MAX_MESSAGE_LENGTH),
    stack: error ? truncate(stackWithCauses(error), MAX_STACK_LENGTH) : null,
    location: locationOf(context),
    requestId: typeof context["requestId"] === "string" ? context["requestId"] : null,
    context: sanitize(context),
    occurredAt,
  };
}

/** "GET /review/:token" for a request, "storage › store-original" for a job, else the component. */
function locationOf(context: LogContext): string | null {
  const text = (key: string) => (typeof context[key] === "string" ? (context[key] as string) : undefined);
  const route = text("route");
  if (route) return [text("method"), route].filter(Boolean).join(" ");
  const queue = text("queue");
  const job = text("job");
  if (queue || job) return [queue, job].filter(Boolean).join(" › ");
  return text("component") ?? null;
}

function stackWithCauses(error: Error): string {
  let text = error.stack ?? `${error.name}: ${error.message}`;
  let cause: unknown = error.cause;
  for (let depth = 0; cause !== undefined && depth < 3; depth++) {
    text += `\nCaused by: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}`;
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return text;
}

/** Flat, JSON-safe, size-capped, and without anything that looks like a credential. */
function sanitize(context: LogContext): Record<string, ErrorContextValue> {
  const out: Record<string, ErrorContextValue> = {};
  for (const [key, value] of Object.entries(context)) {
    if (Object.keys(out).length >= MAX_CONTEXT_FIELDS) break;
    if (PROMOTED.has(key) || value === undefined || SECRET_KEY.test(key)) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = truncate(value, MAX_CONTEXT_VALUE_LENGTH);
    else out[key] = truncate(safeJson(value), MAX_CONTEXT_VALUE_LENGTH);
  }
  return out;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
