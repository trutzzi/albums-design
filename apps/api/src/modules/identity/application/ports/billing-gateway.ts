import type { PlanCode } from "../../domain/plan";

export interface CheckoutSession {
  url: string;
  externalCustomerId: string;
}

/**
 * Kept behind a port so the product runs end to end with no payment provider
 * configured — the local gateway just flips the plan.
 */
export interface BillingGateway {
  startCheckout(params: {
    studioId: string;
    email: string;
    planCode: PlanCode;
    successUrl: string;
  }): Promise<CheckoutSession>;
}
