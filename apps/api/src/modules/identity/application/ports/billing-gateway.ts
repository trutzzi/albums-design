import type { PlanCode } from "../../domain/plan";
import type { SubscriptionStatus } from "../../domain/subscription";

/** Plans a studio can pay for — the trial is never sold. */
export type PaidPlanCode = Exclude<PlanCode, "TRIAL">;

/**
 * What the payment provider tells us happened, already translated into this app's
 * terms. The webhook route never looks at provider-specific payloads.
 */
export type BillingEvent =
  | {
      type: "checkout-completed";
      studioId: string;
      customerId: string;
      subscriptionId: string;
    }
  | {
      type: "subscription-changed";
      subscriptionId: string;
      customerId: string;
      /** Undefined when the provider's price is not one of ours (a manual change in its dashboard). */
      planCode: PaidPlanCode | undefined;
      status: Exclude<SubscriptionStatus, "TRIALING">;
      periodStart: Date | undefined;
      periodEnd: Date | undefined;
    };

/**
 * Kept behind a port so the product runs end to end with no payment provider
 * configured: with `id: "none"` the plan simply switches, which is what local
 * development, demo mode and tests use.
 */
export interface BillingGateway {
  readonly id: "none" | "stripe";

  /** A hosted payment page for a new subscription. */
  startCheckout(params: {
    studioId: string;
    email: string;
    planCode: PaidPlanCode;
    /** Reused when the studio paid before, so the provider keeps one customer per studio. */
    customerId: string | undefined;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;

  /** The provider's self-service page: change plan, update the card, see invoices, cancel. */
  openPortal(params: { customerId: string; returnUrl: string }): Promise<{ url: string }>;

  /**
   * Verifies the signature and translates the payload. `undefined` for events this app
   * does not act on; throws when the signature does not verify.
   */
  parseWebhook(rawBody: Buffer, signature: string): Promise<BillingEvent | undefined>;
}

/** The gateway used when no payment provider is configured. */
export class NoBillingGateway implements BillingGateway {
  readonly id = "none" as const;

  async startCheckout(): Promise<{ url: string }> {
    throw new Error("No payment provider is configured.");
  }

  async openPortal(): Promise<{ url: string }> {
    throw new Error("No payment provider is configured.");
  }

  async parseWebhook(): Promise<BillingEvent | undefined> {
    throw new Error("No payment provider is configured.");
  }
}
