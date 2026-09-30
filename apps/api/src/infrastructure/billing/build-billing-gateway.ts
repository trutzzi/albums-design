import type { Env } from "../../shared-kernel/env";
import { NoBillingGateway, type BillingGateway } from "../../modules/identity/application/ports/billing-gateway";
import { StripeBillingGateway } from "../../modules/identity/infrastructure/billing/stripe-billing-gateway";

/** The one place that turns `BILLING_PROVIDER` into an adapter. */
export function buildBillingGateway(env: Env): BillingGateway {
  if (env.BILLING_PROVIDER === "none") return new NoBillingGateway();

  const required = {
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_STARTER: env.STRIPE_PRICE_STARTER,
    STRIPE_PRICE_STUDIO: env.STRIPE_PRICE_STUDIO,
    STRIPE_PRICE_STUDIO_PRO: env.STRIPE_PRICE_STUDIO_PRO,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  // Refusing to start beats taking a studio to a checkout that cannot complete.
  if (missing.length > 0) throw new Error(`BILLING_PROVIDER=stripe requires: ${missing.join(", ")}`);

  return new StripeBillingGateway({
    secretKey: required.STRIPE_SECRET_KEY!,
    webhookSecret: required.STRIPE_WEBHOOK_SECRET!,
    prices: {
      STARTER: required.STRIPE_PRICE_STARTER!,
      STUDIO: required.STRIPE_PRICE_STUDIO!,
      STUDIO_PRO: required.STRIPE_PRICE_STUDIO_PRO!,
    },
  });
}
