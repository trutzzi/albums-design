import { and, count, desc, eq, gte, ilike, isNull, lt, or, type SQL } from "drizzle-orm";
import type { Database } from "#src/db/client";
import type {
  SignupAttempt,
  SignupAttemptFilter,
  SignupAttemptRepository,
  SignupBlock,
  SignupBlockRepository,
  SignupOutcome,
} from "../../domain/signup-log";
import { signupAttempts, signupBlocks } from "./schema";

export class DrizzleSignupAttemptRepository implements SignupAttemptRepository {
  constructor(private readonly db: Database) {}

  async record(attempt: SignupAttempt): Promise<void> {
    await this.db.insert(signupAttempts).values(attempt);
  }

  async markConfirmed(memberId: string, at: Date): Promise<void> {
    await this.db
      .update(signupAttempts)
      .set({ confirmedAt: at })
      .where(and(eq(signupAttempts.memberId, memberId), isNull(signupAttempts.confirmedAt)));
  }

  async list(filter: SignupAttemptFilter): Promise<{ items: SignupAttempt[]; total: number }> {
    const conditions: SQL[] = [];
    if (filter.outcome) conditions.push(eq(signupAttempts.outcome, filter.outcome));
    if (filter.search) {
      const like = `%${filter.search.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
      conditions.push(or(ilike(signupAttempts.email, like), ilike(signupAttempts.ip, like))!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(signupAttempts)
        .where(where)
        .orderBy(desc(signupAttempts.at))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(signupAttempts).where(where),
    ]);
    return { items: rows, total: totals?.total ?? 0 };
  }

  async countByOutcome(since: Date): Promise<Partial<Record<SignupOutcome, number>>> {
    const rows = await this.db
      .select({ outcome: signupAttempts.outcome, total: count() })
      .from(signupAttempts)
      .where(gte(signupAttempts.at, since))
      .groupBy(signupAttempts.outcome);
    return Object.fromEntries(rows.map((row) => [row.outcome, row.total]));
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(signupAttempts)
      .where(lt(signupAttempts.at, cutoff))
      .returning({ id: signupAttempts.id });
    return deleted.length;
  }
}

export class DrizzleSignupBlockRepository implements SignupBlockRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<SignupBlock[]> {
    return this.db.select().from(signupBlocks).orderBy(desc(signupBlocks.createdAt));
  }

  async add(block: SignupBlock): Promise<void> {
    await this.db.insert(signupBlocks).values(block).onConflictDoNothing();
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(signupBlocks).where(eq(signupBlocks.id, id));
  }
}

/** The demo's and the tests' stand-ins. */
export class InMemorySignupAttemptRepository implements SignupAttemptRepository {
  readonly items: SignupAttempt[] = [];

  async record(attempt: SignupAttempt): Promise<void> {
    this.items.push({ ...attempt });
  }

  async markConfirmed(memberId: string, at: Date): Promise<void> {
    for (const item of this.items) if (item.memberId === memberId && !item.confirmedAt) item.confirmedAt = at;
  }

  async list(filter: SignupAttemptFilter): Promise<{ items: SignupAttempt[]; total: number }> {
    const needle = filter.search?.toLowerCase();
    const matching = this.items
      .filter((item) => !filter.outcome || item.outcome === filter.outcome)
      .filter((item) => !needle || item.email.includes(needle) || (item.ip ?? "").includes(needle))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    const start = (filter.page - 1) * filter.pageSize;
    return { items: matching.slice(start, start + filter.pageSize), total: matching.length };
  }

  async countByOutcome(since: Date): Promise<Partial<Record<SignupOutcome, number>>> {
    const counts: Partial<Record<SignupOutcome, number>> = {};
    for (const item of this.items) if (item.at >= since) counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
    return counts;
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    const before = this.items.length;
    this.items.splice(0, this.items.length, ...this.items.filter((item) => item.at >= cutoff));
    return before - this.items.length;
  }
}

export class InMemorySignupBlockRepository implements SignupBlockRepository {
  readonly items: SignupBlock[] = [];

  async list(): Promise<SignupBlock[]> {
    return [...this.items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async add(block: SignupBlock): Promise<void> {
    if (this.items.some((item) => item.kind === block.kind && item.value === block.value)) return;
    this.items.push({ ...block });
  }

  async remove(id: string): Promise<void> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) this.items.splice(index, 1);
  }
}
