import { sql } from "drizzle-orm";
import type { Database } from "../../../db/client";
import type { DependencyProbe } from "../application/ports/stats-source";

type QueueCounts = Awaited<ReturnType<DependencyProbe["queues"]>>;

/** Production: time a trivial query, and ask BullMQ how much work is waiting. */
export class LiveDependencyProbe implements DependencyProbe {
  constructor(
    private readonly db: Database,
    private readonly queueCounts: () => Promise<QueueCounts>,
    private readonly timeoutMs = 2000,
  ) {}

  async databaseLatencyMs(): Promise<number | null> {
    const started = performance.now();
    try {
      await Promise.race([
        this.db.execute(sql`select 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), this.timeoutMs)),
      ]);
      return Math.round((performance.now() - started) * 10) / 10;
    } catch {
      return null;
    }
  }

  async queues(): Promise<QueueCounts> {
    return this.queueCounts();
  }
}

/** Demo mode keeps everything in memory and runs jobs inline, so there is nothing to wait on. */
export class InProcessDependencyProbe implements DependencyProbe {
  async databaseLatencyMs(): Promise<number | null> {
    return 0;
  }

  async queues(): Promise<QueueCounts> {
    return [];
  }
}
