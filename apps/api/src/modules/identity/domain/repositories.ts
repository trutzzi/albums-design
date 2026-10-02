import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Studio } from "./studio";
import type { StudioMember } from "./studio-member";
import type { Subscription } from "./subscription";

export interface StudioRepository {
  save(studio: Studio): Promise<void>;
  findById(id: UniqueEntityId): Promise<Studio | undefined>;
  findByApiKeyHash(hash: string): Promise<Studio | undefined>;
  /** Every studio, newest first — the platform admin's list. */
  listAll(): Promise<Studio[]>;
  /** One page of studios, newest first, optionally matching a name or owner email. */
  listPage(query: {
    search?: string | undefined;
    offset: number;
    limit: number;
  }): Promise<{ studios: Studio[]; total: number }>;
  delete(id: UniqueEntityId): Promise<void>;
}

export interface SubscriptionRepository {
  save(subscription: Subscription): Promise<void>;
  findByStudioId(studioId: UniqueEntityId): Promise<Subscription | undefined>;
  /** The payment provider's webhooks name its subscription, not our studio. */
  findByExternalSubscriptionId(externalId: string): Promise<Subscription | undefined>;
  listAll(): Promise<Subscription[]>;
  deleteByStudioId(studioId: UniqueEntityId): Promise<void>;
}

export interface StudioMemberRepository {
  save(member: StudioMember): Promise<void>;
  findById(id: UniqueEntityId): Promise<StudioMember | undefined>;
  listByStudioId(studioId: UniqueEntityId): Promise<StudioMember[]>;
  remove(id: UniqueEntityId): Promise<void>;
  /** Login looks a member up by email alone, across every studio. */
  findByEmail(email: string): Promise<StudioMember | undefined>;
  /** Self-serve signups (they have a password) that never confirmed their email, signed up before `cutoff`. */
  findUnconfirmedSignupsBefore(cutoff: Date, limit: number): Promise<StudioMember[]>;
}
