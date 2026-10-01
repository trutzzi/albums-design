import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../../db/client";
import type { ErrorEvent } from "../../../shared-kernel/error-sink";
import {
  fingerprintOf,
  type ErrorIssue,
  type ErrorIssueFilter,
  type ErrorIssueStatus,
  type ErrorLogRepository,
  type ErrorOccurrence,
} from "../domain/error-log";
import { errorIssues, errorOccurrences } from "./schema";

export class DrizzleErrorLogRepository implements ErrorLogRepository {
  constructor(private readonly db: Database) {}

  async record(event: ErrorEvent): Promise<void> {
    await this.db.transaction(async (tx) => {
      // One statement creates the issue or counts another occurrence of it — atomic, so the
      // API and the worker recording the same failure at once both count.
      const [issue] = await tx
        .insert(errorIssues)
        .values({
          id: randomUUID(),
          fingerprint: fingerprintOf(event),
          source: event.source,
          title: event.title,
          errorType: event.errorType,
          errorMessage: event.errorMessage,
          location: event.location,
          status: "OPEN",
          occurrences: 1,
          firstSeenAt: event.occurredAt,
          lastSeenAt: event.occurredAt,
          resolvedAt: null,
        })
        .onConflictDoUpdate({
          target: errorIssues.fingerprint,
          set: {
            occurrences: sql`${errorIssues.occurrences} + 1`,
            lastSeenAt: sql`greatest(${errorIssues.lastSeenAt}, excluded.last_seen_at)`,
            errorMessage: sql`excluded.error_message`,
            // It happened again, so it is not fixed.
            status: "OPEN",
            resolvedAt: null,
          },
        })
        .returning({ id: errorIssues.id });
      await tx.insert(errorOccurrences).values({
        id: randomUUID(),
        issueId: issue!.id,
        occurredAt: event.occurredAt,
        requestId: event.requestId,
        errorMessage: event.errorMessage,
        stack: event.stack,
        context: event.context,
      });
    });
  }

  async list(filter: ErrorIssueFilter): Promise<ErrorIssue[]> {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(errorIssues.status, filter.status));
    if (filter.source) conditions.push(eq(errorIssues.source, filter.source));
    if (filter.search) {
      const pattern = `%${escapeLike(filter.search)}%`;
      conditions.push(
        or(
          ilike(errorIssues.title, pattern),
          ilike(errorIssues.errorMessage, pattern),
          ilike(errorIssues.location, pattern),
          inArray(
            errorIssues.id,
            this.db
              .select({ issueId: errorOccurrences.issueId })
              .from(errorOccurrences)
              .where(eq(errorOccurrences.requestId, filter.search)),
          ),
        )!,
      );
    }
    const rows = await this.db
      .select()
      .from(errorIssues)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(errorIssues.lastSeenAt))
      .limit(filter.limit);
    return rows.map(toIssue);
  }

  async findById(id: string): Promise<ErrorIssue | undefined> {
    const [row] = await this.db.select().from(errorIssues).where(eq(errorIssues.id, id)).limit(1);
    return row ? toIssue(row) : undefined;
  }

  async occurrences(issueId: string, limit: number): Promise<ErrorOccurrence[]> {
    const rows = await this.db
      .select()
      .from(errorOccurrences)
      .where(eq(errorOccurrences.issueId, issueId))
      .orderBy(desc(errorOccurrences.occurredAt))
      .limit(limit);
    return rows.map((row) => ({ ...row }));
  }

  async setStatus(id: string, status: ErrorIssueStatus, at: Date): Promise<ErrorIssue | undefined> {
    const [row] = await this.db
      .update(errorIssues)
      .set({ status, resolvedAt: status === "RESOLVED" ? at : null })
      .where(eq(errorIssues.id, id))
      .returning();
    return row ? toIssue(row) : undefined;
  }

  async purgeOccurrencesBefore(before: Date): Promise<number> {
    const result = await this.db.delete(errorOccurrences).where(lt(errorOccurrences.occurredAt, before));
    return result.count;
  }
}

function toIssue(row: typeof errorIssues.$inferSelect): ErrorIssue {
  return { ...row, source: row.source === "worker" ? "worker" : "api" };
}

/** A search is literal text: `%` and `_` typed by the admin match themselves. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/** Demo mode and tests: the same grouping and reopening rules, held in memory. */
export class InMemoryErrorLogRepository implements ErrorLogRepository {
  readonly issues = new Map<string, ErrorIssue & { fingerprint: string }>();
  readonly occurrenceRows: ErrorOccurrence[] = [];

  async record(event: ErrorEvent): Promise<void> {
    const fingerprint = fingerprintOf(event);
    let issue = [...this.issues.values()].find((candidate) => candidate.fingerprint === fingerprint);
    if (issue) {
      issue.occurrences += 1;
      if (event.occurredAt > issue.lastSeenAt) issue.lastSeenAt = event.occurredAt;
      issue.errorMessage = event.errorMessage;
      issue.status = "OPEN";
      issue.resolvedAt = null;
    } else {
      issue = {
        id: randomUUID(),
        fingerprint,
        source: event.source,
        title: event.title,
        errorType: event.errorType,
        errorMessage: event.errorMessage,
        location: event.location,
        status: "OPEN",
        occurrences: 1,
        firstSeenAt: event.occurredAt,
        lastSeenAt: event.occurredAt,
        resolvedAt: null,
      };
      this.issues.set(issue.id, issue);
    }
    this.occurrenceRows.push({
      id: randomUUID(),
      issueId: issue.id,
      occurredAt: event.occurredAt,
      requestId: event.requestId,
      errorMessage: event.errorMessage,
      stack: event.stack,
      context: event.context,
    });
  }

  async list(filter: ErrorIssueFilter): Promise<ErrorIssue[]> {
    const needle = filter.search?.toLowerCase();
    const byRequest = new Set(
      filter.search
        ? this.occurrenceRows.filter((row) => row.requestId === filter.search).map((row) => row.issueId)
        : [],
    );
    return [...this.issues.values()]
      .filter((issue) => !filter.status || issue.status === filter.status)
      .filter((issue) => !filter.source || issue.source === filter.source)
      .filter(
        (issue) =>
          !needle ||
          byRequest.has(issue.id) ||
          [issue.title, issue.errorMessage, issue.location].some((text) => text?.toLowerCase().includes(needle)),
      )
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, filter.limit)
      .map(({ fingerprint: _fingerprint, ...issue }) => ({ ...issue }));
  }

  async findById(id: string): Promise<ErrorIssue | undefined> {
    const issue = this.issues.get(id);
    if (!issue) return undefined;
    const { fingerprint: _fingerprint, ...rest } = issue;
    return { ...rest };
  }

  async occurrences(issueId: string, limit: number): Promise<ErrorOccurrence[]> {
    return this.occurrenceRows
      .filter((row) => row.issueId === issueId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }

  async setStatus(id: string, status: ErrorIssueStatus, at: Date): Promise<ErrorIssue | undefined> {
    const issue = this.issues.get(id);
    if (!issue) return undefined;
    issue.status = status;
    issue.resolvedAt = status === "RESOLVED" ? at : null;
    return this.findById(id);
  }

  async purgeOccurrencesBefore(before: Date): Promise<number> {
    const kept = this.occurrenceRows.filter((row) => row.occurredAt >= before);
    const removed = this.occurrenceRows.length - kept.length;
    this.occurrenceRows.splice(0, this.occurrenceRows.length, ...kept);
    return removed;
  }
}
