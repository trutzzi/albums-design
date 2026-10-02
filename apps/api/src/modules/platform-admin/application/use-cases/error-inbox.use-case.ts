import { Result } from "@albumflow/domain-kernel";
import { NotFoundError, type ApplicationError } from "#src/shared-kernel/errors";
import type { ErrorContextValue, ErrorSource } from "#src/shared-kernel/error-sink";
import type { ErrorIssue, ErrorIssueStatus, ErrorLogRepository, ErrorOccurrence } from "../../domain/error-log";

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 200;
const OCCURRENCES_SHOWN = 25;

export interface ErrorIssueView {
  id: string;
  source: ErrorSource;
  title: string;
  errorType: string | null;
  errorMessage: string | null;
  location: string | null;
  status: ErrorIssueStatus;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface ErrorOccurrenceView {
  id: string;
  occurredAt: string;
  requestId: string | null;
  errorMessage: string | null;
  stack: string | null;
  context: Record<string, ErrorContextValue>;
}

/**
 * The admin's error inbox: every error-level log entry from the API and the worker,
 * grouped into issues that can be searched (by text or a request id), read with their
 * stack traces, and marked resolved.
 */
export class ErrorInboxUseCase {
  constructor(
    private readonly log: ErrorLogRepository,
    private readonly retentionDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(filter: {
    status?: ErrorIssueStatus | undefined;
    source?: ErrorSource | undefined;
    search?: string | undefined;
  }): Promise<ErrorIssueView[]> {
    const search = filter.search?.trim() || undefined;
    const issues = await this.log.list({ status: filter.status, source: filter.source, search, limit: LIST_LIMIT });
    return issues.map(toIssueView);
  }

  async detail(
    id: string,
  ): Promise<Result<{ issue: ErrorIssueView; occurrences: ErrorOccurrenceView[] }, ApplicationError>> {
    const issue = await this.log.findById(id);
    if (!issue) return Result.failure(new NotFoundError("Error", id));
    const occurrences = await this.log.occurrences(id, OCCURRENCES_SHOWN);
    return Result.success({ issue: toIssueView(issue), occurrences: occurrences.map(toOccurrenceView) });
  }

  async setStatus(id: string, status: ErrorIssueStatus): Promise<Result<ErrorIssueView, ApplicationError>> {
    const issue = await this.log.setStatus(id, status, this.now());
    return issue ? Result.success(toIssueView(issue)) : Result.failure(new NotFoundError("Error", id));
  }

  /** Run daily by the worker. Issues and their counts stay; only old occurrences go. */
  async purgeExpired(): Promise<{ deleted: number }> {
    const cutoff = new Date(this.now().getTime() - this.retentionDays * DAY_MS);
    return { deleted: await this.log.purgeOccurrencesBefore(cutoff) };
  }
}

function toIssueView(issue: ErrorIssue): ErrorIssueView {
  return {
    ...issue,
    firstSeenAt: issue.firstSeenAt.toISOString(),
    lastSeenAt: issue.lastSeenAt.toISOString(),
    resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  };
}

function toOccurrenceView(occurrence: ErrorOccurrence): ErrorOccurrenceView {
  return {
    id: occurrence.id,
    occurredAt: occurrence.occurredAt.toISOString(),
    requestId: occurrence.requestId,
    errorMessage: occurrence.errorMessage,
    stack: occurrence.stack,
    context: occurrence.context,
  };
}
