import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { ErrorRecordingLogger, toErrorEvent } from "../src/infrastructure/monitoring/error-recording-logger";
import { InMemoryErrorLogRepository } from "../src/modules/platform-admin/infrastructure/error-log-repositories";
import { ErrorInboxUseCase } from "../src/modules/platform-admin/application/use-cases/error-inbox.use-case";
import { fingerprintOf } from "../src/modules/platform-admin/domain/error-log";
import { AdminAccess } from "../src/modules/platform-admin/application/use-cases/admin.use-cases";
import { registerPlatformAdminRoutes } from "../src/modules/platform-admin/interface/http/routes";
import { httpServerOptions, registerHttpFoundation } from "../src/interface/http-foundation";
import { RequestMetrics } from "../src/interface/request-metrics";
import { Studio } from "../src/modules/identity/domain/studio";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import type { ErrorEvent, ErrorSink } from "../src/shared-kernel/error-sink";
import "../src/interface/request-context";
import { RecordingLogger } from "./support/recording-logger";
import { InMemoryStudioMemberRepository } from "./support/in-memory";

/** Lets the background write the logger started finish before asserting on it. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function event(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    source: "api",
    title: "request failed",
    errorType: "Error",
    errorMessage: "connect ECONNREFUSED 10.0.0.5:5432",
    stack: "Error: connect ECONNREFUSED\n    at x",
    location: "GET /projects/:projectId/photos",
    requestId: "req-00000001",
    context: {},
    occurredAt: new Date("2026-10-01T10:00:00Z"),
    ...overrides,
  };
}

describe("ErrorRecordingLogger", () => {
  it("keeps error entries — with request id, location and stack — and nothing below error", async () => {
    const log = new InMemoryErrorLogRepository();
    const logger = new ErrorRecordingLogger(new RecordingLogger(), log, "api");

    logger.warn("degraded");
    logger.info("fine");
    logger.error("request failed", {
      err: new Error("boom", { cause: new Error("socket closed") }),
      requestId: "abc-12345678",
      method: "GET",
      route: "/review/:token",
      password: "hunter2",
      apiKey: "af_secret",
      photos: 12,
    });
    await settle();

    const [issue] = await log.list({ limit: 10 });
    assert.equal(log.issues.size, 1);
    assert.equal(issue?.location, "GET /review/:token");
    assert.equal(issue?.errorMessage, "boom");
    const [occurrence] = log.occurrenceRows;
    assert.equal(occurrence?.requestId, "abc-12345678");
    assert.match(occurrence?.stack ?? "", /Caused by: Error: socket closed/);
    assert.deepEqual(
      occurrence?.context,
      { method: "GET", route: "/review/:token", photos: 12 },
      "credentials never stored",
    );
  });

  it("names a worker job by queue and job, and a component otherwise", () => {
    const at = new Date();
    assert.equal(
      toErrorEvent("worker", "job failed", { queue: "storage", job: "store-original" }, at).location,
      "storage › store-original",
    );
    assert.equal(
      toErrorEvent("api", "could not email the studio", { component: "studio-email" }, at).location,
      "studio-email",
    );
    assert.equal(toErrorEvent("api", "unhandled promise rejection", { err: "plain string" }, at).errorType, "string");
  });

  it("carries child bindings into what it records", async () => {
    const log = new InMemoryErrorLogRepository();
    const logger = new ErrorRecordingLogger(new RecordingLogger(), log, "worker").child({ queue: "album-export" });
    logger.error("job failed", { job: "render-album", err: new Error("out of memory") });
    await settle();
    assert.equal((await log.list({ limit: 1 }))[0]?.location, "album-export › render-album");
  });

  it("never throws when the error log itself is down, and says so only once a minute", async () => {
    const inner = new RecordingLogger();
    const broken: ErrorSink = { record: async () => Promise.reject(new Error("database down")) };
    const logger = new ErrorRecordingLogger(inner, broken, "api");
    assert.doesNotThrow(() => {
      logger.error("first");
      logger.error("second");
    });
    await settle();
    assert.equal(
      inner.entries.filter((entry) => entry.level === "error").length,
      2,
      "the log line itself is never lost",
    );
    assert.equal(
      inner.problems.filter((entry) => entry.message === "could not write to the admin error log").length,
      1,
    );
  });

  it("drops entries rather than piling them up when writes back up", async () => {
    const inner = new RecordingLogger();
    let release: () => void = () => {};
    const stuck: ErrorSink = { record: () => new Promise<void>((resolve) => (release = resolve)) };
    const logger = new ErrorRecordingLogger(inner, stuck, "api");
    for (let i = 0; i < 60; i++) logger.error(`failure ${i}`);
    assert.equal(inner.problems.filter((entry) => entry.message.startsWith("error log is falling behind")).length, 1);
    release();
  });
});

describe("the error log", () => {
  it("groups the same failure with different ids into one issue, and keeps different places apart", async () => {
    const log = new InMemoryErrorLogRepository();
    await log.record(event({ errorMessage: `Photo ${UniqueEntityId.create()} was not found.` }));
    await log.record(event({ errorMessage: `Photo ${UniqueEntityId.create()} was not found.`, requestId: "req-2" }));
    await log.record(event({ errorMessage: "Photo 1 was not found.", location: "GET /albums/:albumId" }));

    const issues = await log.list({ limit: 10 });
    assert.equal(issues.length, 2);
    assert.equal(issues.find((issue) => issue.location === "GET /projects/:projectId/photos")?.occurrences, 2);
  });

  it("ignores numbers, hex ids and quoted values when grouping", () => {
    assert.equal(
      fingerprintOf(event({ errorMessage: 'Timeout after 3000ms on "photo-1.jpg" (0xdeadbeefcafe1234)' })),
      fingerprintOf(event({ errorMessage: 'Timeout after 5000ms on "photo-2.jpg" (0x0123456789abcdef)' })),
    );
  });

  it("reopens a resolved issue when it happens again", async () => {
    const log = new InMemoryErrorLogRepository();
    const inbox = new ErrorInboxUseCase(log, 30);
    await log.record(event());
    const [issue] = await inbox.list({});
    assert.equal((await inbox.setStatus(issue!.id, "RESOLVED")).getValue().status, "RESOLVED");
    assert.equal((await inbox.list({ status: "OPEN" })).length, 0);

    await log.record(event());
    const [again] = await inbox.list({ status: "OPEN" });
    assert.equal(again?.occurrences, 2);
    assert.equal(again?.resolvedAt, null);
  });

  it("finds an issue by a request id or by text", async () => {
    const log = new InMemoryErrorLogRepository();
    const inbox = new ErrorInboxUseCase(log, 30);
    await log.record(event({ requestId: "0eab690a-a47e-4330-ab60-108a8d4cfa7b" }));
    await log.record(
      event({ title: "could not email the studio", location: "studio-email", errorMessage: "smtp down" }),
    );

    assert.equal((await inbox.list({ search: " 0eab690a-a47e-4330-ab60-108a8d4cfa7b " }))[0]?.title, "request failed");
    assert.equal((await inbox.list({ search: "SMTP" }))[0]?.location, "studio-email");
    assert.equal((await inbox.list({ search: "nothing like this" })).length, 0);
  });

  it("purges occurrences past retention but keeps the issue and its count", async () => {
    const log = new InMemoryErrorLogRepository();
    const now = new Date("2026-10-31T00:00:00Z");
    const inbox = new ErrorInboxUseCase(log, 30, () => now);
    await log.record(event({ occurredAt: new Date("2026-09-15T00:00:00Z") }));
    await log.record(event({ occurredAt: new Date("2026-10-20T00:00:00Z") }));

    assert.deepEqual(await inbox.purgeExpired(), { deleted: 1 });
    const [issue] = await inbox.list({});
    const detail = (await inbox.detail(issue!.id)).getValue();
    assert.equal(detail.issue.occurrences, 2);
    assert.equal(detail.occurrences.length, 1);
  });
});

describe("the admin Errors tab API", () => {
  async function app() {
    const members = new InMemoryStudioMemberRepository();
    const { studio } = Studio.create({ name: "Golden Hour", ownerEmail: "owner@studio.test" });
    const photographer = StudioMember.signUp({
      studioId: studio.id,
      email: "owner@studio.test",
      name: "Ana",
      passwordHash: "x",
    });
    const admin = StudioMember.signUp({
      studioId: studio.id,
      email: "boss@albumflow.test",
      name: "Boss",
      passwordHash: "x",
    });
    await members.save(photographer);
    await members.save(admin);
    const log = new InMemoryErrorLogRepository();
    const logger = new ErrorRecordingLogger(new RecordingLogger(), log, "api");

    const server = Fastify(httpServerOptions(undefined));
    registerHttpFoundation(server, { logger, metrics: new RequestMetrics() });
    server.addHook("onRequest", async (request) => {
      request.studioId = studio.id.toString();
      const member = request.headers["x-member"];
      if (typeof member === "string") request.memberId = member;
    });
    server.get("/boom", async () => {
      throw new Error("database exploded");
    });
    const unused = {} as never;
    registerPlatformAdminRoutes(server, {
      access: new AdminAccess(members, ["boss@albumflow.test"]),
      feedback: unused,
      dashboard: unused,
      plans: unused,
      errors: new ErrorInboxUseCase(log, 30),
    });
    await server.ready();
    return { server, adminId: admin.id.toString(), photographerId: photographer.id.toString() };
  }

  it("shows a failed request under its request id, with the stack", async () => {
    const { server, adminId } = await app();
    const failed = await server.inject({ method: "GET", url: "/boom" });
    const requestId = String(failed.headers["x-request-id"]);
    await settle();

    const list = await server.inject({
      method: "GET",
      url: `/admin/errors?search=${requestId}`,
      headers: { "x-member": adminId },
    });
    assert.equal(list.statusCode, 200);
    const [issue] = list.json();
    assert.equal(issue.location, "GET /boom");
    assert.equal(issue.errorMessage, "database exploded");

    const detail = await server.inject({
      method: "GET",
      url: `/admin/errors/${issue.id}`,
      headers: { "x-member": adminId },
    });
    assert.equal(detail.json().occurrences[0].requestId, requestId);
    assert.match(detail.json().occurrences[0].stack, /database exploded/);

    const resolved = await server.inject({
      method: "PATCH",
      url: `/admin/errors/${issue.id}`,
      headers: { "x-member": adminId },
      payload: { status: "RESOLVED" },
    });
    assert.equal(resolved.json().status, "RESOLVED");
  });

  it("is invisible to anyone who is not an admin", async () => {
    const { server, photographerId } = await app();
    for (const headers of [{}, { "x-member": photographerId }]) {
      const response = await server.inject({ method: "GET", url: "/admin/errors", headers });
      assert.equal(response.statusCode, 404);
    }
  });

  it("answers an unknown issue with 404", async () => {
    const { server, adminId } = await app();
    const response = await server.inject({
      method: "GET",
      url: `/admin/errors/${UniqueEntityId.create()}`,
      headers: { "x-member": adminId },
    });
    assert.equal(response.statusCode, 404);
  });
});
