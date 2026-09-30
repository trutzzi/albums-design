import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Stripe from "stripe";
import { StripeBillingGateway } from "../src/modules/identity/infrastructure/billing/stripe-billing-gateway";

const WEBHOOK_SECRET = "whsec_test_secret";
const gateway = new StripeBillingGateway({
  secretKey: "sk_test_unused",
  webhookSecret: WEBHOOK_SECRET,
  prices: { STARTER: "price_starter", STUDIO: "price_studio", STUDIO_PRO: "price_pro" },
});

/** A payload signed exactly as Stripe signs it, so the real verification runs. */
function signed(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const signature = new Stripe("sk_test_unused").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { body: Buffer.from(payload), signature };
}

function subscriptionEvent(type: string, status: string, price: string) {
  return signed({
    id: "evt_1",
    object: "event",
    type,
    data: {
      object: {
        id: "sub_1",
        object: "subscription",
        customer: "cus_1",
        status,
        items: {
          data: [{ price: { id: price }, current_period_start: 1790812800, current_period_end: 1793491200 }],
        },
      },
    },
  });
}

describe("Stripe webhook translation", () => {
  it("reads a completed checkout", async () => {
    const { body, signature } = signed({
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          mode: "subscription",
          client_reference_id: "studio-1",
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    assert.deepEqual(await gateway.parseWebhook(body, signature), {
      type: "checkout-completed",
      studioId: "studio-1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    });
  });

  it("maps the price back to our plan, and the period from the subscription item", async () => {
    const { body, signature } = subscriptionEvent("customer.subscription.updated", "active", "price_studio");
    const event = await gateway.parseWebhook(body, signature);
    assert.equal(event?.type, "subscription-changed");
    if (event?.type !== "subscription-changed") return;
    assert.equal(event.planCode, "STUDIO");
    assert.equal(event.status, "ACTIVE");
    assert.equal(event.periodStart?.toISOString(), new Date(1790812800 * 1000).toISOString());
  });

  it("treats past_due and unpaid as past due, and a deletion as cancelled", async () => {
    for (const status of ["past_due", "unpaid", "incomplete"]) {
      const { body, signature } = subscriptionEvent("customer.subscription.updated", status, "price_starter");
      const event = await gateway.parseWebhook(body, signature);
      assert.equal(event?.type === "subscription-changed" && event.status, "PAST_DUE", status);
    }
    const { body, signature } = subscriptionEvent("customer.subscription.deleted", "canceled", "price_starter");
    const event = await gateway.parseWebhook(body, signature);
    assert.equal(event?.type === "subscription-changed" && event.status, "CANCELLED");
  });

  it("ignores events the app does not act on", async () => {
    const { body, signature } = signed({ id: "evt_1", object: "event", type: "invoice.created", data: { object: {} } });
    assert.equal(await gateway.parseWebhook(body, signature), undefined);
  });

  it("throws on a payload that was not signed with our secret", async () => {
    const { body } = subscriptionEvent("customer.subscription.updated", "active", "price_studio");
    await assert.rejects(gateway.parseWebhook(body, "t=1,v1=forged"));
  });
});
