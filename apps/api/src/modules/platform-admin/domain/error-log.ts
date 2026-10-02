import { createHash } from "node:crypto";
import type { ErrorContextValue, ErrorEvent, ErrorSink, ErrorSource } from "#src/shared-kernel/error-sink";

export type ErrorIssueStatus = "OPEN" | "RESOLVED";

/**
 * Every occurrence of the same failure, grouped: what failed, where, how often, and
 * whether someone has dealt with it. A resolved issue reopens when it happens again.
 */
export interface ErrorIssue {
  id: string;
  source: ErrorSource;
  title: string;
  errorType: string | null;
  /** From the latest occurrence. */
  errorMessage: string | null;
  location: string | null;
  status: ErrorIssueStatus;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
}

/** One time an issue happened, with what is needed to trace it. */
export interface ErrorOccurrence {
  id: string;
  issueId: string;
  occurredAt: Date;
  requestId: string | null;
  errorMessage: string | null;
  stack: string | null;
  context: Record<string, ErrorContextValue>;
}

export interface ErrorIssueFilter {
  status?: ErrorIssueStatus | undefined;
  source?: ErrorSource | undefined;
  /** Text in the title, message or location — or an exact request id. */
  search?: string | undefined;
  limit: number;
}

/**
 * The admin error log. Not a load-change-save aggregate: the API and the worker record
 * the same issue at the same moment, so `record` must group and count atomically in the
 * store itself.
 */
export interface ErrorLogRepository extends ErrorSink {
  /** Most recently seen first. */
  list(filter: ErrorIssueFilter): Promise<ErrorIssue[]>;
  findById(id: string): Promise<ErrorIssue | undefined>;
  /** Newest first. */
  occurrences(issueId: string, limit: number): Promise<ErrorOccurrence[]>;
  setStatus(id: string, status: ErrorIssueStatus, at: Date): Promise<ErrorIssue | undefined>;
  /** Deletes occurrences older than `before`; issues keep their counts. Returns how many went. */
  purgeOccurrencesBefore(before: Date): Promise<number>;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX = /\b(?:0x)?[0-9a-f]{8,}\b/gi;
const QUOTED = /(["'`])(?:(?!\1).){1,200}\1/g;
// Also inside tokens ("3000ms", "attempt2"); ids and hex are already replaced by then.
const NUMBER = /\d+(?:\.\d+)?/g;

/**
 * What makes two errors "the same issue": the same failure in the same place, with the
 * variable parts of the message (ids, numbers, quoted values) ignored — so one bad photo
 * id per request does not become a thousand separate issues.
 */
export function fingerprintOf(event: Pick<ErrorEvent, "source" | "title" | "errorType" | "errorMessage" | "location">): string {
  return createHash("sha256")
    .update(
      [event.source, event.title, event.errorType ?? "", normalizeMessage(event.errorMessage ?? ""), event.location ?? ""].join(
        "\u0000",
      ),
    )
    .digest("hex");
}

export function normalizeMessage(message: string): string {
  return message
    .replace(UUID, "<id>")
    .replace(HEX, "<hex>")
    .replace(QUOTED, "<value>")
    .replace(NUMBER, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
