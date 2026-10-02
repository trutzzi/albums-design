import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { ApplicationError, NotFoundError, ValidationError } from "#src/shared-kernel/errors";
import type { StudioRepository, SubscriptionRepository } from "../../domain/repositories";
import type { BillingEvent, BillingGateway, PaidPlanCode } from "../ports/billing-gateway";

/** Billing is the owner's decision: an editor or viewer seat cannot spend the studio's money. */
export class ForbiddenError extends ApplicationError {
  constructor(message: string) {
    super(message, "FORBIDDEN");
  }
}

export type UpgradeOutcome =
  /** No payment provider (local, demo): the plan switched straight away. */
  | { kind: "changed" }
  /** Send the browser here to pay, or to change an existing subscription. */
  | { kind: "redirect"; url: string };

export class BillingUseCase {
  constructor(
    private readonly studios: StudioRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly gateway: BillingGateway,
    private readonly webOrigin: string,
  ) {}

  get provider(): BillingGateway["id"] {
    return this.gateway.id;
  }

  /**
   * A studio without a live paid subscription goes to checkout. One that already pays
   * goes to the provider's portal, where plan changes are prorated correctly — doing
   * that ourselves is how double charges happen.
   */
  async upgrade(params: {
    studioId: string;
    planCode: PaidPlanCode;
    role: string | undefined;
  }): Promise<Result<UpgradeOutcome, ApplicationError>> {
    const denied = ownerOnly(params.role);
    if (denied) return Result.failure(denied);

    const id = UniqueEntityId.create(params.studioId);
    const [studio, subscription] = await Promise.all([
      this.studios.findById(id),
      this.subscriptions.findByStudioId(id),
    ]);
    if (!studio || !subscription) return Result.failure(new NotFoundError("Studio", params.studioId));

    if (this.gateway.id === "none") {
      subscription.changePlan(params.planCode);
      await this.subscriptions.save(subscription);
      return Result.success({ kind: "changed" });
    }

    const returnUrl = `${this.origin}/studio`;
    const paying = subscription.externalSubscriptionId && subscription.status !== "CANCELLED";
    if (paying && subscription.externalCustomerId) {
      const { url } = await this.gateway.openPortal({ customerId: subscription.externalCustomerId, returnUrl });
      return Result.success({ kind: "redirect", url });
    }

    const { url } = await this.gateway.startCheckout({
      studioId: params.studioId,
      email: studio.ownerEmail,
      planCode: params.planCode,
      customerId: subscription.externalCustomerId,
      successUrl: `${returnUrl}?billing=success`,
      cancelUrl: `${returnUrl}?billing=cancelled`,
    });
    return Result.success({ kind: "redirect", url });
  }

  async portal(params: {
    studioId: string;
    role: string | undefined;
  }): Promise<Result<{ url: string }, ApplicationError>> {
    const denied = ownerOnly(params.role);
    if (denied) return Result.failure(denied);
    if (this.gateway.id === "none") return Result.failure(new ValidationError("No payment provider is configured."));

    const subscription = await this.subscriptions.findByStudioId(UniqueEntityId.create(params.studioId));
    if (!subscription?.externalCustomerId) {
      return Result.failure(new ValidationError("This studio has no billing account yet — choose a plan first."));
    }
    return Result.success(
      await this.gateway.openPortal({
        customerId: subscription.externalCustomerId,
        returnUrl: `${this.origin}/studio`,
      }),
    );
  }

  /** Throws when the signature does not verify, which the route answers with a 400. */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = await this.gateway.parseWebhook(rawBody, signature);
    if (event) await this.apply(event);
  }

  /**
   * Idempotent, because providers deliver webhooks at least once and in any order:
   * every event carries the full state it describes rather than a delta.
   */
  async apply(event: BillingEvent): Promise<void> {
    if (event.type === "checkout-completed") {
      const subscription = await this.subscriptions.findByStudioId(UniqueEntityId.create(event.studioId));
      if (!subscription) return;
      subscription.linkExternal({ customerId: event.customerId, subscriptionId: event.subscriptionId });
      await this.subscriptions.save(subscription);
      return;
    }

    const subscription = await this.subscriptions.findByExternalSubscriptionId(event.subscriptionId);
    // A subscription event can arrive before the checkout one that links it; Stripe retries it.
    if (!subscription) throw new Error(`No studio is linked to subscription ${event.subscriptionId} yet.`);

    if (event.status === "CANCELLED") {
      subscription.cancel();
    } else {
      if (event.planCode) subscription.changePlan(event.planCode);
      if (event.status === "PAST_DUE") subscription.markPastDue();
      else subscription.markActive();
    }
    if (event.periodStart && event.periodEnd) subscription.syncPeriod(event.periodStart, event.periodEnd);
    await this.subscriptions.save(subscription);
  }

  private get origin(): string {
    return this.webOrigin.replace(/\/$/, "");
  }
}

/** Requests made with the studio-wide API key carry no role and are the studio itself. */
function ownerOnly(role: string | undefined): ForbiddenError | undefined {
  return role && role !== "OWNER" ? new ForbiddenError("Only the studio owner can manage billing.") : undefined;
}
