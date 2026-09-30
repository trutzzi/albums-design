import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminMe,
  getBusinessStats,
  getSystemStats,
  listAdminFeedback,
  triageFeedback,
  type AdminFeedback,
  type FeedbackKind,
  type FeedbackStatus,
  type FunnelStep,
  type SystemStats,
} from "../../lib/api";
import { BarList, ColumnChart, StatTile } from "./charts";

type Tab = "business" | "feedback" | "server";

const FUNNEL_LABELS: Record<FunnelStep, string> = {
  signedUp: "Signed up",
  createdShoot: "Created a shoot",
  uploadedPhotos: "Uploaded photos",
  builtAlbum: "Built an album",
  sentForReview: "Sent a proof to a client",
  approved: "Got an album approved",
  exported: "Exported a print PDF",
};

const usd = (value: number) => `$${value.toLocaleString("en-GB")}`;
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * The operator's view of AlbumFlow: is the business growing, what are photographers
 * telling us, and is the server healthy. Internal, so English only.
 */
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab | null) ?? "business";
  const me = useQuery({ queryKey: ["admin-me-page"], queryFn: getAdminMe, retry: false });

  if (me.isLoading) return <p className="page muted">Loading…</p>;
  if (!me.data?.admin) {
    return (
      <div className="page">
        <h1>Not available</h1>
        <p className="muted">This page is only for the people who run AlbumFlow.</p>
      </div>
    );
  }

  return (
    <div className="page admin">
      <header className="page__header">
        <div>
          <h1>Admin</h1>
          <p className="muted">How AlbumFlow is doing, what photographers are saying, and how the server is holding up.</p>
        </div>
      </header>
      <div className="admin__tabs" role="tablist">
        {(
          [
            ["business", "Business"],
            ["feedback", "Feedback"],
            ["server", "Server"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`sidebar__tab ${tab === key ? "sidebar__tab--on" : ""}`}
            onClick={() => setParams({ tab: key })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "business" && <BusinessTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "server" && <ServerTab />}
    </div>
  );
}

function BusinessTab() {
  const stats = useQuery({ queryKey: ["admin-business"], queryFn: getBusinessStats, refetchInterval: 60_000 });
  if (stats.isLoading) return <p className="muted">Loading…</p>;
  if (stats.isError || !stats.data) return <p className="error">{(stats.error as Error)?.message}</p>;
  const data = stats.data;
  const signups = data.funnel[0]?.studios ?? 0;

  return (
    <>
      <section className="stat-grid">
        <StatTile
          hero
          label="Monthly recurring revenue"
          value={usd(data.revenue.mrrUsd)}
          detail={`${data.revenue.payingStudios} paying studio${data.revenue.payingStudios === 1 ? "" : "s"}`}
        />
        <StatTile label="Trial → paid" value={`${data.revenue.trialToPaidPct}%`} detail="of every studio that signed up" />
        <StatTile
          label="Active studios"
          value={`${data.activeStudios.d7}`}
          detail={`last 7 days · ${data.activeStudios.d30} in 30 days`}
        />
        <StatTile label="New signups" value={`${data.studios.new7d}`} detail={`last 7 days · ${data.studios.new30d} in 30 days`} />
        <StatTile label="Studios" value={`${data.studios.total}`} detail="all time" />
        <StatTile
          label="Happiness"
          value={data.feedback.averageRating === null ? "—" : `${data.feedback.averageRating} / 5`}
          detail={`${data.feedback.ratings} rating${data.feedback.ratings === 1 ? "" : "s"} in 30 days · ${data.feedback.open} open`}
        />
      </section>
      {(data.revenue.pastDue > 0 || data.revenue.cancelled > 0) && (
        <p className="notice">
          {data.revenue.pastDue} past due · {data.revenue.cancelled} cancelled — worth a personal email.
        </p>
      )}

      <div className="admin__columns">
        <section className="panel">
          <div className="panel__head">
            <h2>Activation funnel</h2>
          </div>
          <p className="muted">How far studios get. The biggest drop is where onboarding needs work.</p>
          <BarList
            max={Math.max(1, signups)}
            rows={data.funnel.map((step, index) => {
              const previous = data.funnel[index - 1]?.studios;
              return {
                key: step.step,
                label: FUNNEL_LABELS[step.step],
                value: step.studios,
                note:
                  index === 0 || !previous
                    ? undefined
                    : `· ${Math.round((step.studios / previous) * 100)}% of previous`,
              };
            })}
          />
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2>Plans</h2>
          </div>
          <BarList rows={data.revenue.plans.map((plan) => ({ key: plan.code, label: plan.name, value: plan.studios }))} />
          <div className="panel__head admin__subhead">
            <h2>All-time volume</h2>
          </div>
          <dl className="admin__totals">
            <dt>Photos uploaded</dt>
            <dd>{data.totals.photos.toLocaleString("en-GB")}</dd>
            <dt>Albums built</dt>
            <dd>{data.totals.albums.toLocaleString("en-GB")}</dd>
            <dt>Proof links sent</dt>
            <dd>{data.totals.reviewLinks.toLocaleString("en-GB")}</dd>
            <dt>Albums approved</dt>
            <dd>{data.totals.approvedAlbums.toLocaleString("en-GB")}</dd>
            <dt>Client selections</dt>
            <dd>{data.totals.clientPicksSubmitted.toLocaleString("en-GB")}</dd>
            <dt>PDF exports</dt>
            <dd>
              {data.totals.exportsReady.toLocaleString("en-GB")}
              {data.totals.exportsFailed > 0 && <span className="error"> · {data.totals.exportsFailed} failed</span>}
            </dd>
          </dl>
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Last 30 days</h2>
        </div>
        <div className="admin__multiples">
          {(
            [
              ["signups", "Signups per day"],
              ["albums", "Albums built per day"],
              ["photos", "Photos uploaded per day"],
            ] as const
          ).map(([key, title]) => (
            <div key={key}>
              <h3 className="admin__chart-title">{title}</h3>
              <ColumnChart
                label={title}
                data={data.daily.map((day) => ({ key: day.day, label: shortDay(day.day), value: day[key] }))}
              />
            </div>
          ))}
        </div>
        <details className="admin__table-toggle">
          <summary>Show as a table</summary>
          <table className="admin__table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Signups</th>
                <th>Albums</th>
                <th>Photos</th>
              </tr>
            </thead>
            <tbody>
              {[...data.daily].reverse().map((day) => (
                <tr key={day.day}>
                  <td>{shortDay(day.day)}</td>
                  <td>{day.signups}</td>
                  <td>{day.albums}</td>
                  <td>{day.photos.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
      <p className="muted admin__footnote">Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB")} · refreshes every minute.</p>
    </>
  );
}

const KIND_LABELS: Record<FeedbackKind, string> = { IDEA: "Idea", PROBLEM: "Problem", QUESTION: "Question", PRAISE: "Praise" };
const STATUS_LABELS: Record<FeedbackStatus, string> = { NEW: "New", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };

function FeedbackTab() {
  const [status, setStatus] = useState<FeedbackStatus | "">("");
  const [kind, setKind] = useState<FeedbackKind | "">("");
  const items = useQuery({
    queryKey: ["admin-feedback", status, kind],
    queryFn: () => listAdminFeedback({ ...(status ? { status } : {}), ...(kind ? { kind } : {}) }),
    refetchInterval: 60_000,
  });

  return (
    <>
      <div className="admin__filters">
        <label>
          Status{" "}
          <select value={status} onChange={(event) => setStatus(event.target.value as FeedbackStatus | "")}>
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kind{" "}
          <select value={kind} onChange={(event) => setKind(event.target.value as FeedbackKind | "")}>
            <option value="">All</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {items.isLoading && <p className="muted">Loading…</p>}
      {items.isError && <p className="error">{(items.error as Error).message}</p>}
      {items.data?.length === 0 && <p className="muted">Nothing here yet.</p>}
      <ul className="admin-feedback">
        {items.data?.map((item) => <FeedbackCard key={item.id} item={item} />)}
      </ul>
    </>
  );
}

function FeedbackCard({ item }: { item: AdminFeedback }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(item.adminNote);
  useEffect(() => setNote(item.adminNote), [item.adminNote]);
  const update = useMutation({
    mutationFn: (change: { status?: FeedbackStatus; adminNote?: string }) => triageFeedback(item.id, change),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-feedback"] }),
  });

  return (
    <li className={`panel admin-feedback__item admin-feedback__item--${item.status.toLowerCase()}`}>
      <div className="admin-feedback__meta">
        <span className={`chip admin-kind admin-kind--${item.kind.toLowerCase()}`}>{KIND_LABELS[item.kind]}</span>
        {item.rating !== null && <span aria-label={`${item.rating} out of 5`}>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</span>}
        <strong>{item.authorName}</strong>
        <a href={`mailto:${item.authorEmail}?subject=${encodeURIComponent("Re: your AlbumFlow feedback")}`}>{item.authorEmail}</a>
        <span className="muted">· {item.studioName ?? "Unknown studio"}</span>
        <span className="muted admin-feedback__when">{new Date(item.createdAt).toLocaleString("en-GB")}</span>
      </div>
      <p className="admin-feedback__message">{item.message}</p>
      {item.page && <p className="muted admin-feedback__page">Sent from {item.page}</p>}
      <div className="admin-feedback__actions">
        <select
          aria-label="Status"
          value={item.status}
          disabled={update.isPending}
          onChange={(event) => update.mutate({ status: event.target.value as FeedbackStatus })}
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          aria-label="Internal note"
          placeholder="Internal note — only admins see this"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => note !== item.adminNote && update.mutate({ adminNote: note })}
        />
      </div>
      {update.isError && <p className="error">{(update.error as Error).message}</p>}
    </li>
  );
}

function ServerTab() {
  const stats = useQuery({ queryKey: ["admin-system"], queryFn: getSystemStats, refetchInterval: 15_000 });
  if (stats.isLoading) return <p className="muted">Loading…</p>;
  if (stats.isError || !stats.data) return <p className="error">{(stats.error as Error)?.message}</p>;
  const data = stats.data;
  const minuteLabel = (minute: string) => new Date(minute).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const available = data.process.hostMemoryMb.available;
  const memoryPct =
    available === null ? null : Math.round((1 - available / Math.max(1, data.process.hostMemoryMb.total)) * 100);
  const backlog = data.dependencies.queues.reduce((sum, queue) => sum + queue.waiting + queue.delayed, 0);
  const failedJobs = data.dependencies.queues.reduce((sum, queue) => sum + queue.failed, 0);

  return (
    <>
      <section className="stat-grid">
        <HealthTile
          label="Database"
          ok={data.dependencies.database.ok}
          value={data.dependencies.database.ok ? `${data.dependencies.database.latencyMs} ms` : "Unreachable"}
          detail={data.config.mode === "demo" ? "in memory (demo mode)" : "round trip of a trivial query"}
        />
        <HealthTile
          label="Errors (last hour)"
          ok={data.http.lastHour.errorRatePct < 1}
          value={`${data.http.lastHour.errorRatePct}%`}
          detail={`${data.http.lastHour.errors} server errors of ${data.http.lastHour.requests.toLocaleString("en-GB")} requests`}
        />
        <StatTile
          label="Response time"
          value={data.http.lastHour.p95Ms === null ? "—" : `${data.http.lastHour.p95Ms} ms`}
          detail={`p95 · median ${data.http.lastHour.p50Ms ?? "—"} ms`}
        />
        <HealthTile
          label="Job backlog"
          ok={failedJobs === 0}
          value={data.config.mode === "demo" ? "inline" : `${backlog}`}
          detail={data.config.mode === "demo" ? "demo mode runs jobs immediately" : `${failedJobs} failed jobs kept for inspection`}
        />
        <StatTile label="Uptime" value={formatUptime(data.process.uptimeSeconds)} detail={`Node ${data.process.nodeVersion}`} />
        {memoryPct === null ? (
          <StatTile
            label="API memory"
            value={`${data.process.memoryMb.rss} MB`}
            detail={`load ${data.process.loadAverage[0]} on ${data.process.cpus} CPUs`}
          />
        ) : (
          <HealthTile
            label="Host memory"
            ok={memoryPct < 90}
            value={`${memoryPct}% used`}
            detail={`API process ${data.process.memoryMb.rss} MB · load ${data.process.loadAverage[0]} on ${data.process.cpus} CPUs`}
          />
        )}
      </section>

      {data.storageSpace && <StorageSpacePanel space={data.storageSpace} />}

      <div className="admin__columns">
        <section className="panel">
          <div className="panel__head">
            <h2>Requests per minute</h2>
          </div>
          <ColumnChart
            label="Requests per minute, last hour"
            data={data.http.perMinute.map((point) => ({ key: point.minute, label: minuteLabel(point.minute), value: point.requests }))}
          />
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2>p95 response time per minute</h2>
          </div>
          <ColumnChart
            label="p95 response time per minute, last hour"
            format={(value) => `${Math.round(value)} ms`}
            data={data.http.perMinute.map((point) => ({ key: point.minute, label: minuteLabel(point.minute), value: point.p95Ms }))}
          />
        </section>
      </div>

      <div className="admin__columns">
        <section className="panel">
          <div className="panel__head">
            <h2>Slowest routes</h2>
          </div>
          {data.http.slowestRoutes.length === 0 ? (
            <p className="muted">No traffic in the last hour.</p>
          ) : (
            <table className="admin__table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Requests</th>
                  <th>p95</th>
                </tr>
              </thead>
              <tbody>
                {data.http.slowestRoutes.map((route) => (
                  <tr key={route.route}>
                    <td className="admin__mono">{route.route}</td>
                    <td>{route.requests}</td>
                    <td>{route.p95Ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2>Background queues</h2>
          </div>
          {data.dependencies.queues.length === 0 ? (
            <p className="muted">No queues — {data.config.mode === "demo" ? "demo mode runs jobs inline" : "Redis did not answer"}.</p>
          ) : (
            <table className="admin__table">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Waiting</th>
                  <th>Active</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {data.dependencies.queues.map((queue) => (
                  <tr key={queue.name}>
                    <td className="admin__mono">{queue.name}</td>
                    <td>{queue.waiting + queue.delayed}</td>
                    <td>{queue.active}</td>
                    <td className={queue.failed > 0 ? "error" : undefined}>{queue.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="admin__config">
            {(
              [
                ["Storage", data.config.storage],
                ["Email", data.config.email],
                ["Billing", data.config.billing],
                ["Photo AI", data.config.vision],
                ["Error monitoring", data.config.errorMonitoring ? "Sentry" : "off"],
              ] as const
            ).map(([name, value]) => (
              <span key={name} className="chip">
                {name}: {value}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Recent server errors</h2>
        </div>
        {data.http.recentErrors.length === 0 ? (
          <p className="muted">None since the API last started.</p>
        ) : (
          <ul className="admin__errors">
            {data.http.recentErrors.map((error, index) => (
              <li key={`${error.at}-${index}`}>
                <span className="muted">{new Date(error.at).toLocaleTimeString("en-GB")}</span>{" "}
                <span className="admin__mono">
                  {error.method} {error.route}
                </span>{" "}
                — {error.message}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted admin__footnote">
        Request figures cover this API process since it started (up to the last hour) and refresh every 15 seconds.
      </p>
    </>
  );
}

const PROVIDER_NAMES: Record<string, string> = { digistorage: "DigiStorage", memory: "In-memory store (demo)" };

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * Space on the long-term store (DigiStorage) that holds every original. Read from the
 * provider at most every five minutes; warns early, because a full store stops backups.
 */
function StorageSpacePanel({ space }: { space: NonNullable<SystemStats["storageSpace"]> }) {
  const name = PROVIDER_NAMES[space.provider] ?? space.provider;
  const checked = `checked ${new Date(space.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if ("error" in space) {
    return (
      <section className="panel storage-space storage-space--bad">
        <div className="panel__head">
          <h2>
            <span aria-hidden="true">▲</span> {name} space · could not be read
          </h2>
          <span className="muted">{checked}</span>
        </div>
        <p className="error">{space.error}</p>
      </section>
    );
  }
  const pct = space.totalBytes ? Math.min(100, (space.usedBytes / space.totalBytes) * 100) : null;
  const level = pct === null ? "ok" : pct >= 95 ? "bad" : pct >= 85 ? "warn" : "ok";
  const state = level === "bad" ? "Almost full" : level === "warn" ? "Filling up" : "OK";
  return (
    <section className={`panel storage-space storage-space--${level}`}>
      <div className="panel__head">
        <h2>
          <span aria-hidden="true">{level === "ok" ? "●" : "▲"}</span> {name} space · {state}
        </h2>
        <span className="muted">{checked}</span>
      </div>
      <p className="storage-space__figure">
        <strong>{formatBytes(space.usedBytes)}</strong>
        {space.totalBytes !== null && (
          <>
            {" "}
            of {formatBytes(space.totalBytes)} used · <strong>{formatBytes(space.totalBytes - space.usedBytes)}</strong> free
          </>
        )}
      </p>
      {pct !== null && (
        <div
          className="storage-space__meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={`${name} space used`}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="muted storage-space__note">
        {pct !== null && `${Math.round(pct)}% full. `}
        The whole account, not only AlbumFlow&apos;s folder. Originals and the nightly database backups are stored here — when it is full, both stop.
      </p>
    </section>
  );
}

/** A tile whose state is read from an icon and a word as well as colour, never colour alone. */
function HealthTile({ label, ok, value, detail }: { label: string; ok: boolean; value: string; detail: string }) {
  return (
    <div className={`stat-tile stat-tile--${ok ? "good" : "bad"}`}>
      <span className="stat-tile__label">
        <span aria-hidden="true">{ok ? "●" : "▲"}</span> {label} · {ok ? "OK" : "Needs attention"}
      </span>
      <span className="stat-tile__value">{value}</span>
      <span className="stat-tile__detail">{detail}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
