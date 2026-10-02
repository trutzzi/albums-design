import { request } from "./http";
import type { PlanDto } from "./studio";

// --- Feedback & admin ------------------------------------------------------

export type FeedbackKind = "IDEA" | "PROBLEM" | "QUESTION" | "PRAISE";
export type FeedbackStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";

export function submitFeedback(input: {
  kind: FeedbackKind;
  message: string;
  rating?: number;
  page?: string;
}): Promise<{ id: string }> {
  return request("/feedback", { method: "POST", body: JSON.stringify(input) });
}

export function getAdminMe(): Promise<{ admin: boolean }> {
  return request("/admin/me");
}

export interface AdminFeedback {
  id: string;
  studioId: string;
  studioName: string | undefined;
  authorName: string;
  authorEmail: string;
  kind: FeedbackKind;
  message: string;
  rating: number | null;
  page: string | null;
  userAgent: string | null;
  status: FeedbackStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export function listAdminFeedback(filter: { status?: FeedbackStatus; kind?: FeedbackKind }): Promise<AdminFeedback[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.kind) params.set("kind", filter.kind);
  const query = params.toString();
  return request(`/admin/feedback${query ? `?${query}` : ""}`);
}

export function triageFeedback(
  id: string,
  change: { status?: FeedbackStatus; adminNote?: string },
): Promise<AdminFeedback> {
  return request(`/admin/feedback/${id}`, { method: "PATCH", body: JSON.stringify(change) });
}

export type FunnelStep =
  | "signedUp"
  | "createdShoot"
  | "uploadedPhotos"
  | "builtAlbum"
  | "sentForReview"
  | "approved"
  | "exported";

export interface BusinessStats {
  generatedAt: string;
  studios: { total: number; new7d: number; new30d: number };
  activeStudios: { d7: number; d30: number };
  revenue: {
    mrrEur: number;
    payingStudios: number;
    trialToPaidPct: number;
    pastDue: number;
    cancelled: number;
    plans: { code: string; name: string; studios: number }[];
  };
  funnel: { step: FunnelStep; studios: number }[];
  totals: {
    photos: number;
    albums: number;
    reviewLinks: number;
    approvedAlbums: number;
    clientPicksSubmitted: number;
    exportsReady: number;
    exportsFailed: number;
  };
  daily: { day: string; signups: number; photos: number; albums: number }[];
  feedback: { open: number; newCount: number; averageRating: number | null; ratings: number };
}

export function getBusinessStats(): Promise<BusinessStats> {
  return request("/admin/stats/business");
}

export interface SystemStats {
  generatedAt: string;
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    memoryMb: { rss: number; heapUsed: number; heapTotal: number };
    loadAverage: [number, number, number];
    cpus: number;
    /** `null` when the host does not report reclaimable memory (anything but Linux). */
    hostMemoryMb: { total: number; available: number | null };
  };
  dependencies: {
    database: { ok: boolean; latencyMs: number | null };
    queues: { name: string; waiting: number; active: number; delayed: number; failed: number; completed: number }[];
  };
  config: { mode: "production" | "demo"; storage: string; email: string; billing: string; vision: string; errorMonitoring: boolean };
  /** The long-term store's space; `null` when there is none (STORAGE_PROVIDER=none). */
  storageSpace:
    | { provider: string; usedBytes: number; totalBytes: number | null; checkedAt: string }
    | { provider: string; error: string; checkedAt: string }
    | null;
  http: {
    perMinute: { minute: string; requests: number; errors: number; p95Ms: number | null }[];
    lastHour: { requests: number; errors: number; errorRatePct: number; p50Ms: number | null; p95Ms: number | null };
    slowestRoutes: { route: string; requests: number; p95Ms: number }[];
    recentErrors: { at: string; method: string; route: string; message: string }[];
  };
}

export function getSystemStats(): Promise<SystemStats> {
  return request("/admin/stats/system");
}

export interface AdminStudio {
  studioId: string;
  name: string;
  ownerEmail: string;
  createdAt: string;
  planCode: PlanDto["code"] | null;
  status: string | null;
  albumsUsed: number;
  /** `null` means unlimited. */
  albumsIncluded: number | null;
  periodEnd: string | null;
  /** Whether the owner opened their confirmation link. */
  emailConfirmed: boolean | null;
  shoots: number | null;
}

export interface AdminStudioPage {
  studios: AdminStudio[];
  total: number;
  page: number;
  pageSize: number;
}

export function listAdminStudios(query: { page: number; pageSize: number; search?: string }): Promise<AdminStudioPage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search?.trim()) params.set("search", query.search.trim());
  return request(`/admin/studios?${params.toString()}`);
}

/** Plans are changed only here, by a platform admin. */
export function setStudioPlan(studioId: string, planCode: PlanDto["code"]): Promise<AdminStudio> {
  return request(`/admin/studios/${studioId}/plan`, { method: "PUT", body: JSON.stringify({ planCode }) });
}

/** Removes the studio with all its shoots, photos and members. */
export function deleteAdminStudio(studioId: string): Promise<{ shootsDeleted: number }> {
  return request(`/admin/studios/${studioId}`, { method: "DELETE" });
}

export type ErrorIssueStatus = "OPEN" | "RESOLVED";
export type ErrorSource = "api" | "worker";

/** One kind of failure, with every time it happened counted. */
export interface AdminErrorIssue {
  id: string;
  source: ErrorSource;
  /** What the code was doing, e.g. "request failed" or "job failed". */
  title: string;
  errorType: string | null;
  errorMessage: string | null;
  /** "GET /review/:token", "storage › store-original", or the part of the app that logged it. */
  location: string | null;
  status: ErrorIssueStatus;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface AdminErrorOccurrence {
  id: string;
  occurredAt: string;
  requestId: string | null;
  errorMessage: string | null;
  stack: string | null;
  context: Record<string, string | number | boolean | null>;
}

export function listAdminErrors(filter: {
  status?: ErrorIssueStatus;
  source?: ErrorSource;
  search?: string;
}): Promise<AdminErrorIssue[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.source) params.set("source", filter.source);
  if (filter.search) params.set("search", filter.search);
  const query = params.toString();
  return request(`/admin/errors${query ? `?${query}` : ""}`);
}

export function getAdminError(id: string): Promise<{ issue: AdminErrorIssue; occurrences: AdminErrorOccurrence[] }> {
  return request(`/admin/errors/${id}`);
}

export function setAdminErrorStatus(id: string, status: ErrorIssueStatus): Promise<AdminErrorIssue> {
  return request(`/admin/errors/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}
