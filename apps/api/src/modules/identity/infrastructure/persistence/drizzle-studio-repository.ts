import { eq } from "drizzle-orm";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Database } from "../../../../db/client";
import type {
  StudioMemberRepository,
  StudioRepository,
  SubscriptionRepository,
} from "../../domain/repositories";
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
      })
      .onConflictDoUpdate({
        target: studios.id,
        set: { name: studio.name, ownerEmail: studio.ownerEmail, apiKeyHash: studio.apiKeyHash },
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
    await this.db
      .insert(subscriptions)
      .values(row)
      .onConflictDoUpdate({ target: subscriptions.studioId, set: row });
  }

  async findByStudioId(studioId: UniqueEntityId): Promise<Subscription | undefined> {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.studioId, studioId.toString()))
      .limit(1);
    if (!row) return undefined;
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
    };
    await this.db
      .insert(studioMembers)
      .values(row)
      .onConflictDoUpdate({
        target: studioMembers.id,
        set: { name: row.name, role: row.role, acceptedAt: row.acceptedAt },
      });
  }

  async findById(id: UniqueEntityId): Promise<StudioMember | undefined> {
    const [row] = await this.db
      .select()
      .from(studioMembers)
      .where(eq(studioMembers.id, id.toString()))
      .limit(1);
    return row ? toMember(row) : undefined;
  }

  async listByStudioId(studioId: UniqueEntityId): Promise<StudioMember[]> {
    const rows = await this.db
      .select()
      .from(studioMembers)
      .where(eq(studioMembers.studioId, studioId.toString()));
    return rows.map(toMember);
  }

  async remove(id: UniqueEntityId): Promise<void> {
    await this.db.delete(studioMembers).where(eq(studioMembers.id, id.toString()));
  }
}

function toStudio(row: typeof studios.$inferSelect): Studio {
  return Studio.reconstitute(
    {
      name: row.name,
      ownerEmail: row.ownerEmail,
      apiKeyHash: row.apiKeyHash,
      createdAt: row.createdAt,
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
    },
    UniqueEntityId.create(row.id),
  );
}
