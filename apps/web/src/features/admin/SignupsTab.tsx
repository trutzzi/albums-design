import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addSignupBlock,
  listSignupBlocks,
  listSignups,
  removeSignupBlock,
  type SignupAttempt,
  type SignupBlockKind,
  type SignupOutcome,
} from "@/shared/api";
import { SkeletonList } from "@/shared/ui/Loading";
import { browserLabel, firstLanguage } from "./lib/user-agent";

const OUTCOME_LABELS: Record<SignupOutcome, string> = {
  CONFIRMATION_SENT: "Link sent",
  TRAPPED: "Bot (trap field)",
  HUMAN_CHECK_FAILED: "Failed human check",
  RATE_LIMITED: "Too many from this IP",
  BLOCKED: "Blocked",
  ALREADY_REGISTERED: "Already registered",
  INVALID: "Invalid form",
};
const CONFIRMATION_LABELS: Record<NonNullable<SignupAttempt["confirmation"]>, string> = {
  CONFIRMED: "confirmed",
  WAITING: "waiting",
  NEVER: "never confirmed",
};
const KIND_LABELS: Record<SignupBlockKind, string> = { IP: "IP", NETWORK: "Network", EMAIL_DOMAIN: "Email domain" };
const PAGE_SIZE = 50;

const when = (iso: string) => new Date(iso).toLocaleString("en-GB");
const domainOf = (email: string) => email.split("@").pop() ?? "";
/** Kept in step with PUBLIC_MAIL_DOMAINS in the API, which refuses these anyway. */
const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.ro",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "zoho.com",
]);

/**
 * Every sign-up attempt for 90 days — including bots the trap caught and accounts never
 * confirmed, which the 48-hour purge would otherwise erase — and the block list. An IP is
 * looked up by hand on ipinfo.io: this server never sends addresses anywhere.
 */
export function SignupsTab() {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<SignupOutcome | "">("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const attempts = useQuery({
    queryKey: ["admin-signups", outcome, search, page],
    queryFn: () => listSignups({ ...(outcome ? { outcome } : {}), ...(search ? { search } : {}), page }),
    refetchInterval: 60_000,
    // Changing the filter or page keeps the last results (and the counts) until the new ones land.
    placeholderData: keepPreviousData,
  });
  const blocks = useQuery({ queryKey: ["admin-signup-blocks"], queryFn: listSignupBlocks });
  const refreshBlocks = () => queryClient.invalidateQueries({ queryKey: ["admin-signup-blocks"] });
  const block = useMutation({ mutationFn: addSignupBlock, onSuccess: refreshBlocks });
  const unblock = useMutation({ mutationFn: removeSignupBlock, onSuccess: refreshBlocks });

  const confirmBlock = (kind: SignupBlockKind, value: string) => {
    const note = window.prompt(`Block sign-ups from ${KIND_LABELS[kind].toLowerCase()} ${value}?\nOptional note:`, "");
    if (note !== null) block.mutate({ kind, value, ...(note.trim() ? { note: note.trim() } : {}) });
  };
  const counts = attempts.data?.last30Days ?? {};
  const pages = Math.max(1, Math.ceil((attempts.data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <h2>Last 30 days</h2>
          <p className="muted">Kept 90 days, then deleted. Click a number to see those attempts.</p>
        </div>
        <div className="admin__config">
          {(Object.keys(OUTCOME_LABELS) as SignupOutcome[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`chip signup-chip ${outcome === key ? "signup-chip--on" : ""}`}
              aria-pressed={outcome === key}
              onClick={() => {
                setOutcome(outcome === key ? "" : key);
                setPage(1);
              }}
            >
              {OUTCOME_LABELS[key]}: {counts[key] ?? 0}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <form
          className="admin__filters"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draft.trim());
            setPage(1);
          }}
        >
          <label>
            Result{" "}
            <select
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value as SignupOutcome | "");
                setPage(1);
              }}
            >
              <option value="">All</option>
              {(Object.keys(OUTCOME_LABELS) as SignupOutcome[]).map((key) => (
                <option key={key} value={key}>
                  {OUTCOME_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            value={draft}
            placeholder="Email or IP"
            aria-label="Search sign-ups by email or IP"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="button button--small">
            Search
          </button>
        </form>
        {block.isError && <p className="error">{(block.error as Error).message}</p>}

        {attempts.isLoading ? (
          <SkeletonList rows={6} />
        ) : attempts.isError ? (
          <p className="error">{(attempts.error as Error).message}</p>
        ) : (attempts.data?.items.length ?? 0) === 0 ? (
          <p className="muted">No sign-up attempts match.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table signups-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Email</th>
                  <th>IP</th>
                  <th>Browser</th>
                  <th>Language</th>
                  <th>Result</th>
                  <th>
                    <span className="visually-hidden">Block</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {attempts.data!.items.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="admin__mono">{when(attempt.at)}</td>
                    <td>{attempt.email}</td>
                    <td className="admin__mono signups-table__ip">
                      {attempt.ip ? (
                        <a
                          href={`https://ipinfo.io/${encodeURIComponent(attempt.ip)}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          title="Look up where this IP is (opens ipinfo.io)"
                        >
                          {attempt.ip}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td title={attempt.userAgent ?? undefined}>{browserLabel(attempt.userAgent)}</td>
                    <td>{firstLanguage(attempt.language) ?? <span className="muted">none</span>}</td>
                    <td>
                      {OUTCOME_LABELS[attempt.outcome]}
                      {attempt.confirmation && (
                        <span className={attempt.confirmation === "NEVER" ? " error" : " muted"}>
                          {" "}
                          · {CONFIRMATION_LABELS[attempt.confirmation]}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="signups-table__actions">
                        {attempt.ip && (
                          <>
                            <button
                              type="button"
                              className="link-button"
                              aria-label={`Block IP ${attempt.ip}`}
                              onClick={() => confirmBlock("IP", attempt.ip!)}
                            >
                              Block IP
                            </button>
                            <button
                              type="button"
                              className="link-button"
                              title={attempt.network ?? undefined}
                              aria-label={`Block network ${attempt.network ?? attempt.ip}`}
                              onClick={() => confirmBlock("NETWORK", attempt.ip!)}
                            >
                              Block network
                            </button>
                          </>
                        )}
                        {!PUBLIC_MAIL_DOMAINS.has(domainOf(attempt.email)) && (
                          <button
                            type="button"
                            className="link-button"
                            aria-label={`Block every address at ${domainOf(attempt.email)}`}
                            onClick={() => confirmBlock("EMAIL_DOMAIN", domainOf(attempt.email))}
                          >
                            Block @{domainOf(attempt.email)}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="admin__pager">
            <button
              type="button"
              className="button button--small"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              ← Newer
            </button>
            <span className="muted">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              className="button button--small"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Older →
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Block list</h2>
          <p className="muted">Sign-ups matching any of these are refused (and still logged as Blocked).</p>
        </div>
        {unblock.isError && <p className="error">{(unblock.error as Error).message}</p>}
        {blocks.isLoading ? (
          <SkeletonList rows={2} />
        ) : (blocks.data?.length ?? 0) === 0 ? (
          <p className="muted">Nothing is blocked. Use the Block links in the list above.</p>
        ) : (
          <ul className="signup-blocks">
            {blocks.data!.map((entry) => (
              <li key={entry.id}>
                <span className="chip">{KIND_LABELS[entry.kind]}</span>
                <span className="admin__mono">{entry.value}</span>
                {entry.note && <span className="muted">{entry.note}</span>}
                <span className="muted">since {when(entry.createdAt)}</span>
                <button
                  type="button"
                  className="button button--small"
                  disabled={unblock.isPending}
                  onClick={() => unblock.mutate(entry.id)}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
