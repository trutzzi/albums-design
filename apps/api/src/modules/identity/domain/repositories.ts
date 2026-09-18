import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Studio } from "./studio";
import type { StudioMember } from "./studio-member";
import type { Subscription } from "./subscription";

export interface StudioRepository {
  save(studio: Studio): Promise<void>;
  findById(id: UniqueEntityId): Promise<Studio | undefined>;
  findByApiKeyHash(hash: string): Promise<Studio | undefined>;
}

export interface SubscriptionRepository {
  save(subscription: Subscription): Promise<void>;
  findByStudioId(studioId: UniqueEntityId): Promise<Subscription | undefined>;
}

export interface StudioMemberRepository {
  save(member: StudioMember): Promise<void>;
  findById(id: UniqueEntityId): Promise<StudioMember | undefined>;
  listByStudioId(studioId: UniqueEntityId): Promise<StudioMember[]>;
  remove(id: UniqueEntityId): Promise<void>;
  /** Login looks a member up by email alone, across every studio. */
  findByEmail(email: string): Promise<StudioMember | undefined>;
}
