import Stripe from "stripe";
import type { BillingEvent, BillingGateway, PaidPlanCode } from "../../application/ports/billing-gateway";

export interface StripeBillingConfig {
  secretKey: string;
  webhookSecret: string;
  /** The Stripe price id (`price_…`) of each plan, created once in the Stripe dashboard. */
  prices: Record<PaidPlanCode, string>;
}

/**
 * Stripe Checkout for a first subscription, the Customer Portal for everything after
 * (plan changes, card updates, invoices, cancelling) and webhooks to learn the
 * outcome. Nothing here trusts the browser: a plan only changes when Stripe says so.
 */
export class StripeBillingGateway implements BillingGateway {
  readonly id = "stripe" as const;
  private readonly stripe: Stripe;
  private readonly planByPrice: Map<string, PaidPlanCode>;

  constructor(private readonly config: StripeBillingConfig) {
    this.stripe = new Stripe(config.secretKey);
    this.planByPrice = new Map(
      (Object.entries(config.prices) as [PaidPlanCode, string][]).map(([plan, price]) => [price, plan]),
    );
  }

  async startCheckout(params: {
    studioId: string;
    email: string;
    planCode: PaidPlanCode;
    customerId: string | undefined;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.config.prices[params.planCode], quantity: 1 }],
      // How the webhook finds the studio again: Stripe echoes this back untouched.
      client_reference_id: params.studioId,
      subscription_data: { metadata: { studioId: params.studioId } },
      ...(params.customerId ? { customer: params.customerId } : { customer_email: params.email }),
      allow_promotion_codes: true,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { url: session.url };
  }

  async openPortal(params: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  async parseWebhook(rawBody: Buffer, signature: string): Promise<BillingEvent | undefined> {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.client_reference_id) return undefined;
      return {
        type: "checkout-completed",
        studioId: session.client_reference_id,
        customerId: idOf(session.customer),
        subscriptionId: idOf(session.subscription),
      };
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object;
      const item = subscription.items.data[0];
      return {
        type: "subscription-changed",
        subscriptionId: subscription.id,
        customerId: idOf(subscription.customer),
        planCode: item ? this.planByPrice.get(item.price.id) : undefined,
        status: event.type === "customer.subscription.deleted" ? "CANCELLED" : statusFrom(subscription.status),
        periodStart: item ? new Date(item.current_period_start * 1000) : undefined,
        periodEnd: item ? new Date(item.current_period_end * 1000) : undefined,
      };
    }

    return undefined;
  }
}

function idOf(value: string | { id: string } | null | undefined): string {
  if (!value) throw new Error("Stripe event is missing an expected id.");
  return typeof value === "string" ? value : value.id;
}

/** Stripe has eight subscription states; the app acts on three. */
function statusFrom(status: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELLED" {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELLED";
    default:
      // past_due, unpaid, incomplete, paused: no new albums until the card works again.
      return "PAST_DUE";
  }
}
