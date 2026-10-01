import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { z } from "zod";
import { Writable } from "node:stream";
import type pino from "pino";
import { httpServerOptions, registerHttpFoundation } from "../src/interface/http-foundation";
import { httpStatusFor, sendApplicationError } from "../src/interface/error-translator";
import { RequestMetrics } from "../src/interface/request-metrics";
import { createPinoLogger, redactUrl } from "../src/infrastructure/logging/pino-logger";
import { ErrorReportingLogger } from "../src/infrastructure/monitoring/error-reporting-logger";
import { FallbackVisionClassifier } from "../src/modules/photo-intelligence/infrastructure/vision/fallback-vision-classifier";
import {
  ApplicationError,
  ConflictError,
  EmailNotVerifiedError,
  InvalidPasswordError,
  NotFoundError,
  PasswordRequiredError,
  TooManyAttemptsError,
  UnauthorizedError,
  ValidationError,
} from "../src/shared-kernel/errors";
import { RecordingLogger } from "./support/recording-logger";

async function appWith(logger = new RecordingLogger(), options: { loggerInstance?: pino.Logger } = {}) {
  const metrics = new RequestMetrics();
  const app = Fastify(httpServerOptions(options.loggerInstance));
  registerHttpFoundation(app, { logger, metrics });
  app.get("/boom", async () => {
    throw new Error("database exploded");
  });
  app.post("/strict", async (request) => z.object({ name: z.string() }).parse(request.body));
  app.get("/rejected", async (_request, reply) => sendApplicationError(reply, new TooManyAttemptsError(90)));
  app.get("/review/:token", async () => {
    throw new Error("render failed");
  });
  await app.ready();
  return { app, logger, metrics };
}

describe("request ids", () => {
  it("gives every response an id, and puts it in a 500's body", async () => {
    const { app } = await appWith();
    const response = await app.inject({ method: "GET", url: "/boom" });
    assert.equal(response.statusCode, 500);
    const id = response.headers["x-request-id"];
    assert.ok(typeof id === "string" && id.length >= 8);
    assert.equal(response.json().requestId, id);
  });

  it("keeps a well-formed id from the caller and replaces a malformed one", async () => {
    const { app } = await appWith();
    const kept = await app.inject({ method: "GET", url: "/rejected", headers: { "x-request-id": "edge-1234abcd" } });
    assert.equal(kept.headers["x-request-id"], "edge-1234abcd");

    const replaced = await app.inject({ method: "GET", url: "/rejected", headers: { "x-request-id": "bad id\nforged log line" } });
    assert.notEqual(replaced.headers["x-request-id"], "bad id\nforged log line");
  });
});

describe("the error handler", () => {
  it("logs a server fault as an error with its stack, counts it, and hides the message", async () => {
    const { app, logger, metrics } = await appWith();
    const response = await app.inject({ method: "GET", url: "/boom" });
    assert.deepEqual(
      { code: response.json().code, message: response.json().message },
      { code: "INTERNAL_ERROR", message: "Something went wrong." },
    );
    const [entry] = logger.problems;
    assert.equal(entry?.level, "error");
    assert.ok(entry?.context?.["err"] instanceof Error);
    assert.equal(entry?.context?.["route"], "/boom");
    assert.equal(entry?.context?.["requestId"], response.headers["x-request-id"]);
    assert.equal(metrics.snapshot().recentErrors[0]?.message, "database exploded");
  });

  it("records the route pattern, never a client link's token", async () => {
    const { app, logger, metrics } = await appWith();
    await app.inject({ method: "GET", url: "/review/s3cr3t-share-token?grant=abc" });
    assert.equal(logger.problems[0]?.context?.["route"], "/review/:token");
    assert.equal(metrics.snapshot().recentErrors[0]?.route, "/review/:token");
  });

  it("answers invalid input with 400 and no error-level log", async () => {
    const { app, logger } = await appWith();
    const response = await app.inject({ method: "POST", url: "/strict", payload: { name: 3 } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "BAD_REQUEST");
    assert.equal(logger.problems.length, 0);
  });

  it("sends Retry-After with a lockout", async () => {
    const { app } = await appWith();
    const response = await app.inject({ method: "GET", url: "/rejected" });
    assert.equal(response.statusCode, 429);
    assert.equal(response.headers["retry-after"], "90");
  });

  it("writes a share token into the access log only as a placeholder", async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const loggerInstance = createPinoLogger({ service: "test", level: "info", environment: "test" }, sink);
    const { app } = await appWith(new RecordingLogger(), { loggerInstance });
    await app.inject({ method: "GET", url: "/review/s3cr3t-share-token?grant=abc" });
    const log = lines.join("");
    assert.ok(log.includes("/review/[token]"), log);
    assert.ok(!log.includes("s3cr3t-share-token"));
    assert.ok(!log.includes("grant=abc"));
  });
});

describe("redactUrl", () => {
  it("drops the query and masks client-link tokens", () => {
    assert.equal(redactUrl("/review/abc123/comments?x=1"), "/review/[token]/comments");
    assert.equal(redactUrl("/download/tok/photos.zip?grant=jwt"), "/download/[token]/photos.zip");
    assert.equal(redactUrl("/pick/tok"), "/pick/[token]");
    assert.equal(redactUrl("/media/a/b.jpg?token=signed"), "/media/a/b.jpg");
    assert.equal(redactUrl("/projects/123/photos"), "/projects/123/photos");
  });
});

describe("the error translator", () => {
  it("gives each code one status, wherever it comes from", () => {
    assert.equal(httpStatusFor(new NotFoundError("Album", "x")), 404);
    assert.equal(httpStatusFor(new ConflictError("x")), 409);
    assert.equal(httpStatusFor(new UnauthorizedError("x")), 401);
    assert.equal(httpStatusFor(new PasswordRequiredError()), 401);
    assert.equal(httpStatusFor(new InvalidPasswordError()), 401);
    assert.equal(httpStatusFor(new ApplicationError("x", "FORBIDDEN")), 403);
    assert.equal(httpStatusFor(new EmailNotVerifiedError()), 403);
    assert.equal(httpStatusFor(new TooManyAttemptsError(5)), 429);
    assert.equal(httpStatusFor(new ValidationError("x")), 422);
    assert.equal(httpStatusFor(new ApplicationError("x", "SOMETHING_NEW")), 422);
  });
});

describe("ErrorReportingLogger", () => {
  it("reports error entries and nothing below", () => {
    const reported: { error: unknown; context: unknown }[] = [];
    const inner = new RecordingLogger();
    const logger = new ErrorReportingLogger(inner, (error, context) => reported.push({ error, context })).child({ component: "email" });
    const cause = new Error("smtp down");

    logger.warn("degraded", { projectId: "p" });
    logger.error("could not email the studio", { projectId: "p", err: cause });
    logger.error("no exception, still an incident");

    assert.equal(inner.entries.length, 3, "every entry still reaches the log");
    assert.equal(reported.length, 2);
    assert.equal(reported[0]!.error, cause);
    assert.deepEqual(reported[0]!.context, { component: "email", projectId: "p", message: "could not email the studio" });
    assert.ok(reported[1]!.error instanceof Error);
    assert.equal((reported[1]!.error as Error).message, "no exception, still an incident");
  });
});

describe("FallbackVisionClassifier", () => {
  it("warns when the provider fails instead of falling back silently", async () => {
    const logger = new RecordingLogger();
    const classifier = new FallbackVisionClassifier(
      { classify: async () => { throw new Error("connection refused"); }, isAvailable: async () => false },
      { classify: async () => ({ category: "DETAIL", confidence: 0.3, faceCount: 0, faceQuality: 0 }), isAvailable: async () => true },
      logger,
    );
    const verdict = await classifier.classify({ bytes: Buffer.alloc(0), metrics: {} as never });
    assert.equal(verdict.category, "DETAIL");
    assert.equal(logger.problems[0]?.level, "warn");
  });
});
