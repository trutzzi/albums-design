import { and, avg, count, desc, eq, gte, inArray, isNotNull, type SQL } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "#src/db/client";
import { Feedback, type FeedbackKind, type FeedbackRepository, type FeedbackStatus } from "../domain/feedback";
import { feedback } from "./schema";

export class DrizzleFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: Database) {}

  async deleteByStudioId(studioId: string): Promise<void> {
    await this.db.delete(feedback).where(eq(feedback.studioId, studioId));
  }

  async save(item: Feedback): Promise<void> {
    const props = item.snapshot;
    const row = {
      id: item.id.toString(),
      studioId: props.studioId,
      memberId: props.memberId ?? null,
      authorName: props.authorName,
      authorEmail: props.authorEmail,
      kind: props.kind,
      message: props.message,
      rating: props.rating ?? null,
      page: props.page ?? null,
      userAgent: props.userAgent ?? null,
      status: props.status,
      adminNote: props.adminNote,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
    await this.db
      .insert(feedback)
      .values(row)
      .onConflictDoUpdate({ target: feedback.id, set: { status: row.status, adminNote: row.adminNote, updatedAt: row.updatedAt } });
  }

  async findById(id: string): Promise<Feedback | undefined> {
    const [row] = await this.db.select().from(feedback).where(eq(feedback.id, id)).limit(1);
    return row ? toDomain(row) : undefined;
  }

  async list(filter: { status?: FeedbackStatus | undefined; kind?: FeedbackKind | undefined; limit: number }): Promise<Feedback[]> {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(feedback.status, filter.status));
    if (filter.kind) conditions.push(eq(feedback.kind, filter.kind));
    const rows = await this.db
      .select()
      .from(feedback)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(feedback.createdAt))
      .limit(filter.limit);
    return rows.map(toDomain);
  }

  async summary(since: Date) {
    const [open] = await this.db
      .select({ total: count() })
      .from(feedback)
      .where(inArray(feedback.status, ["NEW", "IN_PROGRESS"]));
    const [fresh] = await this.db.select({ total: count() }).from(feedback).where(eq(feedback.status, "NEW"));
    const [rated] = await this.db
      .select({ average: avg(feedback.rating), total: count() })
      .from(feedback)
      .where(and(isNotNull(feedback.rating), gte(feedback.createdAt, since)));
    return {
      open: Number(open?.total ?? 0),
      newCount: Number(fresh?.total ?? 0),
      averageRating: rated?.average === null || rated?.average === undefined ? null : Math.round(Number(rated.average) * 10) / 10,
      ratings: Number(rated?.total ?? 0),
    };
  }
}

function toDomain(row: typeof feedback.$inferSelect): Feedback {
  return Feedback.reconstitute(
    {
      studioId: row.studioId,
      memberId: row.memberId ?? undefined,
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      kind: row.kind,
      message: row.message,
      rating: row.rating ?? undefined,
      page: row.page ?? undefined,
      userAgent: row.userAgent ?? undefined,
      status: row.status,
      adminNote: row.adminNote,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    UniqueEntityId.create(row.id),
  );
}

export class InMemoryFeedbackRepository implements FeedbackRepository {
  readonly items = new Map<string, Feedback>();

  async deleteByStudioId(studioId: string): Promise<void> {
    for (const [id, item] of this.items) if (item.snapshot.studioId === studioId) this.items.delete(id);
  }

  async save(item: Feedback): Promise<void> {
    this.items.set(item.id.toString(), item);
  }

  async findById(id: string): Promise<Feedback | undefined> {
    return this.items.get(id);
  }

  async list(filter: { status?: FeedbackStatus | undefined; kind?: FeedbackKind | undefined; limit: number }): Promise<Feedback[]> {
    return [...this.items.values()]
      .filter((item) => (!filter.status || item.status === filter.status) && (!filter.kind || item.snapshot.kind === filter.kind))
      .sort((a, b) => b.snapshot.createdAt.getTime() - a.snapshot.createdAt.getTime())
      .slice(0, filter.limit);
  }

  async summary(since: Date) {
    const all = [...this.items.values()];
    const rated = all.filter((item) => item.snapshot.rating !== undefined && item.snapshot.createdAt >= since);
    return {
      open: all.filter((item) => item.status !== "RESOLVED").length,
      newCount: all.filter((item) => item.status === "NEW").length,
      averageRating: rated.length
        ? Math.round((rated.reduce((sum, item) => sum + (item.snapshot.rating ?? 0), 0) / rated.length) * 10) / 10
        : null,
      ratings: rated.length,
    };
  }
}
