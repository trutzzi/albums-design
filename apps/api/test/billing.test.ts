import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { Studio } from "../src/modules/identity/domain/studio";
import { Subscription } from "../src/modules/identity/domain/subscription";
import { BillingUseCase } from "../src/modules/identity/application/use-cases/billing.use-case";
import {
  NoBillingGateway,
  type BillingEvent,
  type BillingGateway,
} from "../src/modules/identity/application/ports/billing-gateway";
import { registerBillingRoutes } from "../src/modules/identity/interface/http/routes";
import { acceptEmptyJsonBody } from "../src/interface/empty-body";
import { InMemoryStudioRepository, InMemorySubscriptionRepository } from "./support/in-memory";

class FakeGateway implements BillingGateway {
  readonly id = "stripe" as const;
  checkouts: Parameters<BillingGateway["startCheckout"]>[0][] = [];
  portals: string[] = [];
  nextEvent: BillingEvent | undefined;
  lastWebhookBody: Buffer | undefined;

  async startCheckout(params: Parameters<BillingGateway["startCheckout"]>[0]) {
    this.checkouts.push(params);
    return { url: "https://checkout.test/session" };
  }
  async openPortal(params: { customerId: string }) {
    this.portals.push(params.customerId);
    return { url: "https://portal.test/session" };
  }
  async parseWebhook(rawBody: Buffer, signature: string) {
    if (signature !== "good-signature") throw new Error("bad signature");
    this.lastWebhookBody = rawBody;
    return this.nextEvent;
  }
}

async function setup(gateway: BillingGateway = new FakeGateway()) {
  const studios = new InMemoryStudioRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const { studio } = Studio.create({ name: "Golden Hour", ownerEmail: "owner@studio.test" });
  await studios.save(studio);
  await subscriptions.save(Subscription.startTrial(studio.id));
  const billing = new BillingUseCase(studios, subscriptions, gateway, "https://app.test/");
  const studioId = studio.id.toString();
  const subscription = () => subscriptions.findByStudioId(UniqueEntityId.create(studioId));
  return { billing, studioId, subscription, gateway };
}

describe("billing without a payment provider", () => {
  it("switches the plan straight away", async () => {
    const { billing, studioId, subscription } = await setup(new NoBillingGateway());
    const result = await billing.upgrade({ studioId, planCode: "STUDIO", role: "OWNER" });
    assert.deepEqual(result.getValue(), { kind: "changed" });
    assert.equal((await subscription())?.planCode, "STUDIO");
  });
});

describe("billing through Stripe", () => {
  it("sends a studio without a subscription to checkout, and changes nothing yet", async () => {
    const gateway = new FakeGateway();
    const { billing, studioId, subscription } = await setup(gateway);
    const result = await billing.upgrade({ studioId, planCode: "STARTER", role: "OWNER" });

    assert.deepEqual(result.getValue(), { kind: "redirect", url: "https://checkout.test/session" });
    assert.equal(gateway.checkouts[0]?.email, "owner@studio.test");
    assert.equal(gateway.checkouts[0]?.successUrl, "https://app.test/studio?billing=success");
    assert.equal((await subscription())?.planCode, "TRIAL", "the plan waits for Stripe to confirm payment");
  });

  it("refuses anyone but the owner", async () => {
    const { billing, studioId } = await setup();
    const result = await billing.upgrade({ studioId, planCode: "STARTER", role: "EDITOR" });
    assert.equal(result.getError().code, "FORBIDDEN");
  });

  it("activates the paid plan when Stripe confirms, and renews the allowance", async () => {
    const { billing, studioId, subscription } = await setup();
    const trial = await subscription();
    trial!.recordAlbumCreated();

    await billing.apply({ type: "checkout-completed", studioId, customerId: "cus_1", subscriptionId: "sub_1" });
    await billing.apply({
      type: "subscription-changed",
      subscriptionId: "sub_1",
      customerId: "cus_1",
      planCode: "STUDIO",
      status: "ACTIVE",
      periodStart: new Date("2026-10-01T00:00:00Z"),
      periodEnd: new Date("2026-11-01T00:00:00Z"),
    });

    const paid = await subscription();
    assert.equal(paid?.planCode, "STUDIO");
    assert.equal(paid?.status, "ACTIVE");
    assert.equal(paid?.albumsUsed, 0);
    assert.equal(paid?.periodEnd.toISOString(), "2026-11-01T00:00:00.000Z");
  });

  it("sends a paying studio to the portal to change plans", async () => {
    const gateway = new FakeGateway();
    const { billing, studioId } = await setup(gateway);
    await billing.apply({ type: "checkout-completed", studioId, customerId: "cus_1", subscriptionId: "sub_1" });

    const result = await billing.upgrade({ studioId, planCode: "STUDIO_PRO", role: "OWNER" });
    assert.deepEqual(result.getValue(), { kind: "redirect", url: "https://portal.test/session" });
    assert.deepEqual(gateway.portals, ["cus_1"]);
    assert.equal(gateway.checkouts.length, 0);
  });

  it("blocks new albums when a payment fails, and after cancelling", async () => {
    const { billing, studioId, subscription } = await setup();
    await billing.apply({ type: "checkout-completed", studioId, customerId: "cus_1", subscriptionId: "sub_1" });
    const change = (status: "PAST_DUE" | "CANCELLED") =>
      billing.apply({
        type: "subscription-changed",
        subscriptionId: "sub_1",
        customerId: "cus_1",
        planCode: "STARTER",
        status,
        periodStart: undefined,
        periodEnd: undefined,
      });

    await change("PAST_DUE");
    assert.equal((await subscription())?.canCreateAlbum().allowed, false);
    await change("CANCELLED");
    assert.equal((await subscription())?.status, "CANCELLED");

    // Cancelled studios go back through checkout, not the portal.
    const again = await billing.upgrade({ studioId, planCode: "STARTER", role: "OWNER" });
    assert.equal(again.getValue().kind, "redirect");
  });

  it("asks Stripe to retry a subscription event that arrives before its checkout", async () => {
    const { billing } = await setup();
    await assert.rejects(
      billing.apply({
        type: "subscription-changed",
        subscriptionId: "sub_unknown",
        customerId: "cus_1",
        planCode: "STARTER",
        status: "ACTIVE",
        periodStart: undefined,
        periodEnd: undefined,
      }),
    );
  });
});

describe("the billing webhook route", () => {
  async function app() {
    const gateway = new FakeGateway();
    const { billing, studioId, subscription } = await setup(gateway);
    const server = Fastify();
    acceptEmptyJsonBody(server);
    registerBillingRoutes(server, billing);
    server.post("/echo", async (request) => request.body);
    await server.ready();
    return { server, gateway, studioId, subscription };
  }

  it("hands the gateway the exact bytes that were sent", async () => {
    const { server, gateway, studioId, subscription } = await app();
    gateway.nextEvent = { type: "checkout-completed", studioId, customerId: "cus_9", subscriptionId: "sub_9" };
    const body = '{"id": "evt_1",  "spacing":"kept"}';
    const response = await server.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: { "content-type": "application/json", "stripe-signature": "good-signature" },
      payload: body,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(gateway.lastWebhookBody?.toString(), body);
    assert.equal((await subscription())?.externalSubscriptionId, "sub_9");
  });

  it("rejects a bad signature", async () => {
    const { server } = await app();
    const response = await server.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: { "content-type": "application/json", "stripe-signature": "forged" },
      payload: "{}",
    });
    assert.equal(response.statusCode, 400);
  });

  it("leaves JSON parsing unchanged for every other route", async () => {
    const { server } = await app();
    const response = await server.inject({ method: "POST", url: "/echo", payload: { hello: "world" } });
    assert.deepEqual(response.json(), { hello: "world" });
  });
});
