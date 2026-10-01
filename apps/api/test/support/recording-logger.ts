import type { LogContext, Logger } from "../../src/shared-kernel/logger";

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context: LogContext | undefined;
}

/** Keeps every entry so a test can assert what was logged, at which level. */
export class RecordingLogger implements Logger {
  readonly entries: LogEntry[] = [];

  debug(message: string, context?: LogContext): void {
    this.entries.push({ level: "debug", message, context });
  }

  info(message: string, context?: LogContext): void {
    this.entries.push({ level: "info", message, context });
  }

  warn(message: string, context?: LogContext): void {
    this.entries.push({ level: "warn", message, context });
  }

  error(message: string, context?: LogContext): void {
    this.entries.push({ level: "error", message, context });
  }

  child(): Logger {
    return this;
  }

  /** Entries at warn or above — what an operator would be told about. */
  get problems(): LogEntry[] {
    return this.entries.filter((entry) => entry.level === "warn" || entry.level === "error");
  }
}
