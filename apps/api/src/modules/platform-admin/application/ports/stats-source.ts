import type { StatsInput } from "../../domain/business-stats";

/** Where the facts behind the business numbers come from: SQL in production, memory in demo mode. */
export interface StatsSource {
  load(): Promise<StatsInput>;
}

/** Live checks of the things the API depends on. Each answers in its own time budget. */
export interface DependencyProbe {
  /** Round-trip time of a trivial query, or `null` when the database cannot be reached. */
  databaseLatencyMs(): Promise<number | null>;
  /** Jobs per state for each background queue; empty when jobs run inline (demo mode). */
  queues(): Promise<{ name: string; waiting: number; active: number; delayed: number; failed: number; completed: number }[]>;
}
