import type { FastifyInstance } from "fastify";

const MINUTE_MS = 60_000;
const WINDOW_MINUTES = 60;
/** Enough samples for a stable p95 in one minute without holding a busy minute's every request. */
const SAMPLES_PER_MINUTE = 2000;
const RECENT_ERRORS = 20;

interface MinuteBucket {
  minute: number;
  requests: number;
  errors: number;
  durations: number[];
  byRoute: Map<string, number[]>;
}

export interface RecentError {
  at: string;
  method: string;
  route: string;
  message: string;
}

export interface HttpStats {
  /** Last 60 minutes, oldest first; minutes with no traffic are included as zeros. */
  perMinute: { minute: string; requests: number; errors: number; p95Ms: number | null }[];
  lastHour: { requests: number; errors: number; errorRatePct: number; p50Ms: number | null; p95Ms: number | null };
  slowestRoutes: { route: string; requests: number; p95Ms: number }[];
  recentErrors: RecentError[];
}

/**
 * Request counts, latency and server errors for the last hour, held in this process.
 * It is what an operator needs to answer "is it slow or broken right now?" without a
 * metrics service; it resets on restart and covers this one API process only.
 */
export class RequestMetrics {
  private readonly buckets = new Map<number, MinuteBucket>();
  private readonly errors: RecentError[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  record(route: string, status: number, durationMs: number): void {
    const minute = Math.floor(this.now() / MINUTE_MS);
    let bucket = this.buckets.get(minute);
    if (!bucket) {
      bucket = { minute, requests: 0, errors: 0, durations: [], byRoute: new Map() };
      this.buckets.set(minute, bucket);
      for (const key of this.buckets.keys()) if (key < minute - WINDOW_MINUTES) this.buckets.delete(key);
    }
    bucket.requests += 1;
    if (status >= 500) bucket.errors += 1;
    if (bucket.durations.length < SAMPLES_PER_MINUTE) bucket.durations.push(durationMs);
    const routeSamples = bucket.byRoute.get(route) ?? [];
    if (routeSamples.length < SAMPLES_PER_MINUTE) routeSamples.push(durationMs);
    bucket.byRoute.set(route, routeSamples);
  }

  recordError(error: RecentError): void {
    this.errors.unshift(error);
    this.errors.length = Math.min(this.errors.length, RECENT_ERRORS);
  }

  snapshot(): HttpStats {
    const current = Math.floor(this.now() / MINUTE_MS);
    const perMinute: HttpStats["perMinute"] = [];
    const all: number[] = [];
    const routes = new Map<string, number[]>();
    let requests = 0;
    let errors = 0;

    for (let minute = current - WINDOW_MINUTES + 1; minute <= current; minute++) {
      const bucket = this.buckets.get(minute);
      perMinute.push({
        minute: new Date(minute * MINUTE_MS).toISOString(),
        requests: bucket?.requests ?? 0,
        errors: bucket?.errors ?? 0,
        p95Ms: bucket ? percentile(bucket.durations, 0.95) : null,
      });
      if (!bucket) continue;
      requests += bucket.requests;
      errors += bucket.errors;
      all.push(...bucket.durations);
      for (const [route, samples] of bucket.byRoute) routes.set(route, [...(routes.get(route) ?? []), ...samples]);
    }

    return {
      perMinute,
      lastHour: {
        requests,
        errors,
        errorRatePct: requests === 0 ? 0 : Math.round((errors / requests) * 1000) / 10,
        p50Ms: percentile(all, 0.5),
        p95Ms: percentile(all, 0.95),
      },
      slowestRoutes: [...routes.entries()]
        .map(([route, samples]) => ({ route, requests: samples.length, p95Ms: percentile(samples, 0.95) ?? 0 }))
        .sort((a, b) => b.p95Ms - a.p95Ms)
        .slice(0, 6),
      recentErrors: [...this.errors],
    };
  }
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Math.round(sorted[index]! * 10) / 10;
}

/** Times every request by its route pattern (never the raw URL, which holds ids and tokens). */
export function registerRequestMetrics(app: FastifyInstance, metrics: RequestMetrics): void {
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url ?? "unmatched";
    // The health check is polled constantly by the deploy job and would drown real traffic.
    if (route === "/health") return;
    metrics.record(`${request.method} ${route}`, reply.statusCode, reply.elapsedTime);
  });
}
