import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminError,
  listAdminErrors,
  setAdminErrorStatus,
  type AdminErrorIssue,
  type ErrorIssueStatus,
  type ErrorSource,
} from "@/shared/api";

const SOURCE_LABELS: Record<ErrorSource, string> = { api: "API", worker: "Worker" };
const STATUS_LABELS: Record<ErrorIssueStatus, string> = { OPEN: "Open", RESOLVED: "Resolved" };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB");

/**
 * Every error the API and the worker logged, grouped into issues: what failed, where, how
 * often. Paste a request id from a bug report into the search to find exactly that failure.
 */
export function ErrorsTab({ initialSearch = "" }: { initialSearch?: string }) {
  const [status, setStatus] = useState<ErrorIssueStatus | "">("OPEN");
  const [source, setSource] = useState<ErrorSource | "">("");
  const [draft, setDraft] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  // A search looks through resolved issues too: the request in a bug report may be an old one.
  const effectiveStatus = search ? "" : status;
  const issues = useQuery({
    queryKey: ["admin-errors", effectiveStatus, source, search],
    queryFn: () =>
      listAdminErrors({
        ...(effectiveStatus ? { status: effectiveStatus } : {}),
        ...(source ? { source } : {}),
        ...(search ? { search } : {}),
      }),
    refetchInterval: 30_000,
  });

  return (
    <>
      <form
        className="admin__filters admin-errors__filters"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(draft.trim());
        }}
      >
        <label>
          Status{" "}
          <select
            value={effectiveStatus}
            disabled={Boolean(search)}
            onChange={(event) => setStatus(event.target.value as ErrorIssueStatus | "")}
          >
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Where{" "}
          <select value={source} onChange={(event) => setSource(event.target.value as ErrorSource | "")}>
            <option value="">API and worker</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-errors__search">
          <input
            type="search"
            aria-label="Search errors"
            value={draft}
            placeholder="Search a message, route or request id"
            onChange={(event) => {
              setDraft(event.target.value);
              if (!event.target.value) setSearch("");
            }}
          />
        </label>
        <button type="submit" className="button button--small">
          Search
        </button>
      </form>
      {search && <p className="muted admin-errors__hint">Searching open and resolved errors for “{search}”.</p>}
      {issues.isLoading && <p className="muted">Loading…</p>}
      {issues.isError && <p className="error">{(issues.error as Error).message}</p>}
      {issues.data?.length === 0 && (
        <p className="muted">
          {search ? "No error matches that search." : status === "OPEN" ? "No open errors." : "No errors."}
        </p>
      )}
      <ul className="admin-errors">
        {issues.data?.map((issue) => (
          <ErrorIssueCard key={issue.id} issue={issue} />
        ))}
      </ul>
    </>
  );
}

function ErrorIssueCard({ issue }: { issue: AdminErrorIssue }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ["admin-error", issue.id],
    queryFn: () => getAdminError(issue.id),
    enabled: open,
  });
  const update = useMutation({
    mutationFn: (status: ErrorIssueStatus) => setAdminErrorStatus(issue.id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-errors"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-error", issue.id] });
    },
  });

  return (
    <li className={`panel admin-errors__item admin-errors__item--${issue.status.toLowerCase()}`}>
      <div className="admin-errors__meta">
        <span className={`chip ${issue.status === "OPEN" ? "chip--failed" : "chip--approved"}`}>
          {STATUS_LABELS[issue.status]}
        </span>
        <span className="chip">{SOURCE_LABELS[issue.source]}</span>
        {issue.location && <span className="admin__mono">{issue.location}</span>}
        <span className="muted admin-errors__count">
          {issue.occurrences}× · last {when(issue.lastSeenAt)}
        </span>
      </div>
      <p className="admin-errors__title">
        <strong>{issue.title}</strong>
        {issue.errorMessage && <span className="admin-errors__message"> — {issue.errorMessage}</span>}
      </p>
      <p className="muted admin-errors__seen">
        First seen {when(issue.firstSeenAt)}
        {issue.resolvedAt && ` · resolved ${when(issue.resolvedAt)}`}
        {issue.errorType && ` · ${issue.errorType}`}
      </p>
      <div className="admin-errors__actions">
        <button type="button" className="button button--small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide details" : "Details"}
        </button>
        <button
          type="button"
          className="button button--small"
          disabled={update.isPending}
          onClick={() => update.mutate(issue.status === "OPEN" ? "RESOLVED" : "OPEN")}
        >
          {issue.status === "OPEN" ? "Mark resolved" : "Reopen"}
        </button>
      </div>
      {update.isError && <p className="error">{(update.error as Error).message}</p>}
      {open && (
        <div className="admin-errors__detail">
          {detail.isLoading && <p className="muted">Loading…</p>}
          {detail.isError && <p className="error">{(detail.error as Error).message}</p>}
          {detail.data && (
            <>
              <ol className="admin-errors__occurrences">
                {detail.data.occurrences.map((occurrence) => (
                  <li key={occurrence.id}>
                    <div className="admin-errors__meta">
                      <span className="muted">{when(occurrence.occurredAt)}</span>
                      {occurrence.requestId && <span className="admin__mono">request {occurrence.requestId}</span>}
                    </div>
                    {occurrence.errorMessage && <p className="admin__mono">{occurrence.errorMessage}</p>}
                    {Object.keys(occurrence.context).length > 0 && (
                      <dl className="admin-errors__context">
                        {Object.entries(occurrence.context).map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd className="admin__mono">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {occurrence.stack && (
                      <details>
                        <summary>Stack trace</summary>
                        <pre className="admin-errors__stack">{occurrence.stack}</pre>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
              {detail.data.issue.occurrences > detail.data.occurrences.length && (
                <p className="muted">
                  Showing the latest {detail.data.occurrences.length} of {detail.data.issue.occurrences}; older ones are
                  removed after the retention period.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
