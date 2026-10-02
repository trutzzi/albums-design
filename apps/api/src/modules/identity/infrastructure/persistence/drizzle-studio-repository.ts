import { and, count, desc, eq, ilike, isNotNull, isNull, lt, or } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "#src/db/client";
import type { StudioMemberRepository, StudioRepository, SubscriptionRepository } from "../../domain/repositories";
import { Studio } from "../../domain/studio";
import { StudioMember } from "../../domain/studio-member";
import { Subscription } from "../../domain/subscription";
import { studioMembers, studios, subscriptions } from "./schema";

export class DrizzleStudioRepository implements StudioRepository {
  constructor(private readonly db: Database) {}

  async save(studio: Studio): Promise<void> {
    await this.db
      .insert(studios)
      .values({
        id: studio.id.toString(),
        name: studio.name,
        ownerEmail: studio.ownerEmail,
        apiKeyHash: studio.apiKeyHash,
        createdAt: studio.createdAt,
        ...brandingColumns(studio),
      })
      .onConflictDoUpdate({
        target: studios.id,
        set: {
          name: studio.name,
          ownerEmail: studio.ownerEmail,
          apiKeyHash: studio.apiKeyHash,
          ...brandingColumns(studio),
        },
      });
  }

  async findById(id: UniqueEntityId): Promise<Studio | undefined> {
    const [row] = await this.db.select().from(studios).where(eq(studios.id, id.toString())).limit(1);
    return row ? toStudio(row) : undefined;
  }

  async findByApiKeyHash(hash: string): Promise<Studio | undefined> {
    const [row] = await this.db.select().from(studios).where(eq(studios.apiKeyHash, hash)).limit(1);
    return row ? toStudio(row) : undefined;
  }

  async listAll(): Promise<Studio[]> {
    const rows = await this.db.select().from(studios).orderBy(desc(studios.createdAt));
    return rows.map(toStudio);
  }

  async listPage(query: { search?: string | undefined; offset: number; limit: number }) {
    const term = query.search?.trim();
    // `%` and `_` typed by the admin are matched literally, not as wildcards.
    const pattern = term ? `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;
    const where = pattern ? or(ilike(studios.name, pattern), ilike(studios.ownerEmail, pattern)) : undefined;
    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(studios)
        .where(where)
        .orderBy(desc(studios.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(studios).where(where),
    ]);
    return { studios: rows.map(toStudio), total: Number(totals?.total ?? 0) };
  }

  async delete(id: UniqueEntityId): Promise<void> {
    await this.db.delete(studios).where(eq(studios.id, id.toString()));
  }
}

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async save(subscription: Subscription): Promise<void> {
    const row = {
      id: subscription.id.toString(),
      studioId: subscription.studioId.toString(),
      planCode: subscription.planCode,
      status: subscription.status,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      albumsUsed: subscription.albumsUsed,
      externalCustomerId: subscription.externalCustomerId ?? null,
      externalSubscriptionId: subscription.externalSubscriptionId ?? null,
    };
    await this.db.insert(subscriptions).values(row).onConflictDoUpdate({ target: subscriptions.studioId, set: row });
  }

  async findByStudioId(studioId: UniqueEntityId): Promise<Subscription | undefined> {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.studioId, studioId.toString()))
      .limit(1);
    return row ? toSubscription(row) : undefined;
  }

  async findByExternalSubscriptionId(externalId: string): Promise<Subscription | undefined> {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.externalSubscriptionId, externalId))
      .limit(1);
    return row ? toSubscription(row) : undefined;
  }

  async listAll(): Promise<Subscription[]> {
    const rows = await this.db.select().from(subscriptions);
    return rows.map(toSubscription);
  }

  async deleteByStudioId(studioId: UniqueEntityId): Promise<void> {
    await this.db.delete(subscriptions).where(eq(subscriptions.studioId, studioId.toString()));
  }
}

function toSubscription(row: typeof subscriptions.$inferSelect): Subscription {
  return Subscription.reconstitute(
    {
      studioId: UniqueEntityId.create(row.studioId),
      planCode: row.planCode,
      status: row.status,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      albumsUsed: row.albumsUsed,
      externalCustomerId: row.externalCustomerId ?? undefined,
      externalSubscriptionId: row.externalSubscriptionId ?? undefined,
    },
    UniqueEntityId.create(row.id),
  );
}

export class DrizzleStudioMemberRepository implements StudioMemberRepository {
  constructor(private readonly db: Database) {}

  async save(member: StudioMember): Promise<void> {
    const row = {
      id: member.id.toString(),
      studioId: member.studioId.toString(),
      email: member.email,
      name: member.name,
      role: member.role,
      invitedAt: member.invitedAt,
      acceptedAt: member.acceptedAt ?? null,
      passwordHash: member.passwordHash ?? null,
      emailVerifiedAt: member.emailVerifiedAt ?? null,
    };
    await this.db
      .insert(studioMembers)
      .values(row)
      .onConflictDoUpdate({
        target: studioMembers.id,
        set: {
          name: row.name,
          role: row.role,
          acceptedAt: row.acceptedAt,
          passwordHash: row.passwordHash,
          emailVerifiedAt: row.emailVerifiedAt,
        },
      });
  }

  async findById(id: UniqueEntityId): Promise<StudioMember | undefined> {
    const [row] = await this.db.select().from(studioMembers).where(eq(studioMembers.id, id.toString())).limit(1);
    return row ? toMember(row) : undefined;
  }

  async listByStudioId(studioId: UniqueEntityId): Promise<StudioMember[]> {
    const rows = await this.db.select().from(studioMembers).where(eq(studioMembers.studioId, studioId.toString()));
    return rows.map(toMember);
  }

  async remove(id: UniqueEntityId): Promise<void> {
    await this.db.delete(studioMembers).where(eq(studioMembers.id, id.toString()));
  }

  async findByEmail(email: string): Promise<StudioMember | undefined> {
    const [row] = await this.db.select().from(studioMembers).where(eq(studioMembers.email, email)).limit(1);
    return row ? toMember(row) : undefined;
  }

  async findUnconfirmedSignupsBefore(cutoff: Date, limit: number): Promise<StudioMember[]> {
    const rows = await this.db
      .select()
      .from(studioMembers)
      .where(
        and(
          isNotNull(studioMembers.passwordHash),
          isNull(studioMembers.emailVerifiedAt),
          lt(studioMembers.invitedAt, cutoff),
        ),
      )
      .limit(limit);
    return rows.map(toMember);
  }
}

function brandingColumns(studio: Studio) {
  return {
    brandName: studio.branding?.displayName ?? null,
    brandAccent: studio.branding?.accent ?? null,
    brandLogo: studio.branding?.logo ?? null,
  };
}

function toStudio(row: typeof studios.$inferSelect): Studio {
  return Studio.reconstitute(
    {
      name: row.name,
      ownerEmail: row.ownerEmail,
      apiKeyHash: row.apiKeyHash,
      createdAt: row.createdAt,
      branding:
        row.brandName !== null || row.brandAccent !== null || row.brandLogo !== null
          ? { displayName: row.brandName ?? "", accent: row.brandAccent, logo: row.brandLogo }
          : undefined,
    },
    UniqueEntityId.create(row.id),
  );
}

function toMember(row: typeof studioMembers.$inferSelect): StudioMember {
  return StudioMember.reconstitute(
    {
      studioId: UniqueEntityId.create(row.studioId),
      email: row.email,
      name: row.name,
      role: row.role,
      invitedAt: row.invitedAt,
      acceptedAt: row.acceptedAt ?? undefined,
      passwordHash: row.passwordHash ?? undefined,
      emailVerifiedAt: row.emailVerifiedAt ?? undefined,
    },
    UniqueEntityId.create(row.id),
  );
}
