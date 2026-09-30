import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { computeBusinessStats, type StatsInput } from "../src/modules/platform-admin/domain/business-stats";
import { RequestMetrics, percentile } from "../src/interface/request-metrics";
import { InMemoryFeedbackRepository } from "../src/modules/platform-admin/infrastructure/feedback-repositories";
import { InMemoryStatsSource } from "../src/modules/platform-admin/infrastructure/stats-sources";
import { InProcessDependencyProbe } from "../src/modules/platform-admin/infrastructure/dependency-probes";
import {
  AdminAccess,
  AdminDashboardUseCase,
  FeedbackUseCase,
} from "../src/modules/platform-admin/application/use-cases/admin.use-cases";
import { registerPlatformAdminRoutes } from "../src/modules/platform-admin/interface/http/routes";
import { Studio } from "../src/modules/identity/domain/studio";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { Subscription } from "../src/modules/identity/domain/subscription";
import type { EmailMessage } from "../src/shared-kernel/email";
import "../src/interface/request-context";
import {
  InMemoryAlbumRepository,
  InMemoryExportJobRepository,
  InMemoryPhotoRepository,
  InMemoryPickSessionRepository,
  InMemoryProjectRepository,
  InMemoryReviewSessionRepository,
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
} from "./support/in-memory";

const NOW = new Date("2026-09-30T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("business stats", () => {
  const input: StatsInput = {
    studios: [
      { id: "s1", createdAt: daysAgo(40) },
      { id: "s2", createdAt: daysAgo(10) },
      { id: "s3", createdAt: daysAgo(2) },
      { id: "s4", createdAt: daysAgo(1) },
    ],
    subscriptions: [
      { studioId: "s1", planCode: "STUDIO", status: "ACTIVE" },
      { studioId: "s2", planCode: "STARTER", status: "ACTIVE" },
      { studioId: "s3", planCode: "STARTER", status: "PAST_DUE" },
      { studioId: "s4", planCode: "TRIAL", status: "TRIALING" },
    ],
    projects: [
      { id: "p1", studioId: "s1", createdAt: daysAgo(35) },
      { id: "p2", studioId: "s2", createdAt: daysAgo(5) },
      { id: "p3", studioId: "s3", createdAt: daysAgo(1) },
    ],
    photoDays: [
      { projectId: "p1", day: "2026-08-26", count: 300 },
      { projectId: "p2", day: "2026-09-26", count: 120 },
    ],
    albums: [
      { id: "a1", projectId: "p1", status: "EXPORTED", createdAt: daysAgo(34) },
      { id: "a2", projectId: "p2", status: "IN_REVIEW", createdAt: daysAgo(3) },
    ],
    reviews: [
      { albumId: "a1", status: "APPROVED", createdAt: daysAgo(33) },
      { albumId: "a2", status: "OPEN", createdAt: daysAgo(3) },
    ],
    picks: [{ projectId: "p2", status: "SUBMITTED" }],
    exports: [
      { albumId: "a1", status: "READY", requestedAt: daysAgo(32) },
      { albumId: "a2", status: "FAILED", requestedAt: daysAgo(2) },
    ],
  };
  const stats = computeBusinessStats(input, NOW);

  it("counts signups by window", () => {
    assert.deepEqual(stats.studios, { total: 4, new7d: 2, new30d: 3 });
  });

  it("counts studios that made something recently as active", () => {
    // s2 (shoot, photos, album) and s3 (shoot) in the last week; s1 only long ago.
    assert.deepEqual(stats.activeStudios, { d7: 2, d30: 2 });
  });

  it("sums monthly revenue from paying, active plans only", () => {
    assert.equal(stats.revenue.mrrUsd, 129 + 39, "a past-due Starter is not revenue");
    assert.equal(stats.revenue.payingStudios, 2);
    assert.equal(stats.revenue.trialToPaidPct, 50);
    assert.equal(stats.revenue.pastDue, 1);
  });

  it("shows where studios stop, step by step", () => {
    assert.deepEqual(
      stats.funnel.map((step) => step.studios),
      [4, 3, 2, 2, 2, 1, 1],
    );
  });

  it("totals the work done and lays the last 30 days out day by day", () => {
    assert.equal(stats.totals.photos, 420);
    assert.equal(stats.totals.exportsFailed, 1);
    assert.equal(stats.totals.clientPicksSubmitted, 1);
    assert.equal(stats.daily.length, 30);
    assert.equal(stats.daily.at(-1)?.day, "2026-09-30");
    assert.equal(stats.daily.find((day) => day.day === "2026-09-26")?.photos, 120);
  });
});

describe("request metrics", () => {
  it("reports the last hour's traffic, errors and slowest routes", () => {
    let clock = NOW.getTime();
    const metrics = new RequestMetrics(() => clock);
    for (let i = 0; i < 19; i++) metrics.record("GET /albums/:albumId", 200, 20);
    metrics.record("GET /albums/:albumId", 500, 900);
    clock += 60_000;
    metrics.record("POST /projects/:projectId/albums", 201, 1500);

    const snapshot = metrics.snapshot();
    assert.equal(snapshot.lastHour.requests, 21);
    assert.equal(snapshot.lastHour.errors, 1);
    assert.equal(snapshot.slowestRoutes[0]?.route, "POST /projects/:projectId/albums");
    assert.equal(snapshot.perMinute.length, 60);
  });

  it("forgets traffic older than an hour", () => {
    let clock = NOW.getTime();
    const metrics = new RequestMetrics(() => clock);
    metrics.record("GET /x", 200, 10);
    clock += 61 * 60_000;
    metrics.record("GET /x", 200, 10);
    assert.equal(metrics.snapshot().lastHour.requests, 1);
  });

  it("computes percentiles", () => {
    assert.equal(percentile([1, 2, 3, 4, 100], 0.5), 3);
    assert.equal(percentile([], 0.95), null);
  });
});

describe("feedback and the admin area", () => {
  async function app() {
    const studios = new InMemoryStudioRepository();
    const members = new InMemoryStudioMemberRepository();
    const subscriptions = new InMemorySubscriptionRepository();
    const { studio } = Studio.create({ name: "Golden Hour", ownerEmail: "owner@studio.test" });
    await studios.save(studio);
    await subscriptions.save(Subscription.startTrial(studio.id));
    const photographer = StudioMember.signUp({ studioId: studio.id, email: "owner@studio.test", name: "Ana", passwordHash: "x" });
    const admin = StudioMember.signUp({ studioId: studio.id, email: "Boss@AlbumFlow.test", name: "Boss", passwordHash: "x" });
    await members.save(photographer);
    await members.save(admin);

    const sent: EmailMessage[] = [];
    const access = new AdminAccess(members, ["boss@albumflow.test"]);
    const feedbackRepository = new InMemoryFeedbackRepository();
    const server = Fastify();
    // Stands in for the auth hook: who is calling comes from test headers.
    server.addHook("onRequest", async (request) => {
      request.studioId = studio.id.toString();
      const member = request.headers["x-member"];
      if (typeof member === "string") request.memberId = member;
    });
    registerPlatformAdminRoutes(server, {
      access,
      feedback: new FeedbackUseCase(
        feedbackRepository,
        members,
        studios,
        access,
        { id: "test", send: async (message) => void sent.push(message) },
        "https://app.test",
      ),
      dashboard: new AdminDashboardUseCase(
        new InMemoryStatsSource({
          studios,
          subscriptions,
          projects: new InMemoryProjectRepository(),
          photos: new InMemoryPhotoRepository(),
          albums: new InMemoryAlbumRepository(),
          reviews: new InMemoryReviewSessionRepository(),
          picks: new InMemoryPickSessionRepository(),
          exports: new InMemoryExportJobRepository(),
        }),
        feedbackRepository,
        new InProcessDependencyProbe(),
        new RequestMetrics(),
        { mode: "demo", storage: "none", email: "log", billing: "none", vision: "heuristic", errorMonitoring: false },
      ),
    });
    await server.ready();
    return { server, sent, photographerId: photographer.id.toString(), adminId: admin.id.toString() };
  }

  it("takes feedback from a photographer and emails the admins", async () => {
    const { server, sent, photographerId } = await app();
    const response = await server.inject({
      method: "POST",
      url: "/feedback",
      headers: { "x-member": photographerId, "user-agent": "Test/1.0" },
      payload: { kind: "PROBLEM", message: "Export stuck at rendering", rating: 2, page: "/albums/123" },
    });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(sent[0]?.to, ["boss@albumflow.test"]);
    assert.equal(sent[0]?.replyTo, "owner@studio.test");
    assert.match(sent[0]!.text, /Export stuck at rendering/);
  });

  it("refuses empty feedback and impossible ratings", async () => {
    const { server, photographerId } = await app();
    const empty = await server.inject({ method: "POST", url: "/feedback", headers: { "x-member": photographerId }, payload: { kind: "IDEA", message: "   " } });
    const rating = await server.inject({ method: "POST", url: "/feedback", headers: { "x-member": photographerId }, payload: { kind: "IDEA", message: "Hi", rating: 9 } });
    assert.equal(empty.statusCode, 422);
    assert.ok(rating.statusCode >= 400);
  });

  it("hides the admin area from everyone but admins", async () => {
    const { server, photographerId, adminId } = await app();
    const asPhotographer = await server.inject({ method: "GET", url: "/admin/stats/business", headers: { "x-member": photographerId } });
    const withApiKey = await server.inject({ method: "GET", url: "/admin/feedback" });
    const asAdmin = await server.inject({ method: "GET", url: "/admin/stats/business", headers: { "x-member": adminId } });
    assert.equal(asPhotographer.statusCode, 404);
    assert.equal(withApiKey.statusCode, 404);
    assert.equal(asAdmin.statusCode, 200);
    assert.equal(asAdmin.json().studios.total, 1);

    const me = await server.inject({ method: "GET", url: "/admin/me", headers: { "x-member": adminId } });
    assert.deepEqual(me.json(), { admin: true });
  });

  it("lets an admin triage feedback", async () => {
    const { server, photographerId, adminId } = await app();
    const created = await server.inject({ method: "POST", url: "/feedback", headers: { "x-member": photographerId }, payload: { kind: "IDEA", message: "Dark theme for proofs" } });
    const id = created.json().id;

    const updated = await server.inject({
      method: "PATCH",
      url: `/admin/feedback/${id}`,
      headers: { "x-member": adminId },
      payload: { status: "IN_PROGRESS", adminNote: "Planned for October" },
    });
    assert.equal(updated.json().status, "IN_PROGRESS");

    const open = await server.inject({ method: "GET", url: "/admin/feedback?status=IN_PROGRESS", headers: { "x-member": adminId } });
    assert.equal(open.json().length, 1);
    assert.equal(open.json()[0].studioName, "Golden Hour");

    const system = await server.inject({ method: "GET", url: "/admin/stats/system", headers: { "x-member": adminId } });
    assert.equal(system.json().dependencies.database.ok, true);
  });
});
