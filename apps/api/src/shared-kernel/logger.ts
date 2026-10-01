/** Structured fields attached to a log entry. Put a caught error under `err` so its stack is kept. */
export type LogContext = Record<string, unknown>;

/**
 * The one way application code says what happened. Levels carry meaning:
 * `warn` is a degraded path something else will recover (a sweep retries it, a
 * fallback answered), `error` is a failure nobody will retry and someone must look
 * at — in production it also reaches error monitoring. Messages stay constant and
 * the variable parts go in `context`, so entries can be searched and grouped.
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** A logger whose every entry also carries `bindings` (a job id, a component). */
  child(bindings: LogContext): Logger;
}

/** Discards everything: for tests and wiring that deliberately ignore output. */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};

type Level = "debug" | "info" | "warn" | "error";

/**
 * The fallback for classes constructed without a logger (tests, scripts, demo mode):
 * one readable line per entry on stdout/stderr, so nothing is lost and a developer can
 * read it. The API and worker inject a pino-backed JSON logger from the composition root.
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly bindings: LogContext = {}) {}

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }

  child(bindings: LogContext): Logger {
    return new ConsoleLogger({ ...this.bindings, ...bindings });
  }

  private write(level: Level, message: string, context?: LogContext): void {
    const { err, ...fields } = { ...this.bindings, ...context };
    const inline: string[] = [];
    const blocks: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      // Multi-line text (an email body in demo mode) reads better as an indented block.
      if (typeof value === "string" && value.includes("\n")) blocks.push(`  ${key}:\n    ${value.split("\n").join("\n    ")}`);
      else inline.push(`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
    if (err !== undefined) blocks.push(`  ${err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err)}`);
    const line = [
      `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${inline.length ? ` ${inline.join(" ")}` : ""}`,
      ...blocks,
    ].join("\n");
    if (level === "warn" || level === "error") console.error(line);
    else console.log(line);
  }
}

export const consoleLogger: Logger = new ConsoleLogger();
