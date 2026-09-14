import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { AlbumQuotaPolicy, QuotaDecision } from "../../album-composition/application/ports/directories";
import type { SubscriptionRepository } from "../domain/repositories";

/**
 * The adapter that lets Album Composition enforce plan limits without knowing
 * anything about billing.
 */
export class SubscriptionQuotaPolicy implements AlbumQuotaPolicy {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async ensureCanCreateAlbum(studioId: string): Promise<QuotaDecision> {
    const subscription = await this.subscriptions.findByStudioId(UniqueEntityId.create(studioId));
    if (!subscription) {
      return { allowed: false, reason: "This studio has no active subscription." };
    }
    const decision = subscription.canCreateAlbum();
    await this.subscriptions.save(subscription);
    return decision.reason ? { allowed: decision.allowed, reason: decision.reason } : { allowed: decision.allowed };
  }

  async recordAlbumCreated(studioId: string): Promise<void> {
    const subscription = await this.subscriptions.findByStudioId(UniqueEntityId.create(studioId));
    if (!subscription) return;
    subscription.recordAlbumCreated();
    await this.subscriptions.save(subscription);
  }
}
