import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { ContactMessageUseCase } from "../src/modules/platform-admin/application/use-cases/contact-message.use-case";
import { registerPlatformAdminRoutes } from "../src/modules/platform-admin/interface/http/routes";
import { httpServerOptions, registerHttpFoundation } from "../src/interface/http-foundation";
import { registerStudioAuth } from "../src/interface/auth";
import { RequestMetrics } from "../src/interface/request-metrics";
import { AttemptLimiter } from "../src/shared-kernel/attempt-limiter";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import { RecordingLogger } from "./support/recording-logger";
import { InMemoryStudioRepository } from "./support/in-memory";

const INBOX = "contact@albumflow.test";
const message = {
  name: "Ioana Pop",
  email: "ioana@example.com",
  message: "Hello! Do you offer a plan for two photographers?",
  ip: "203.0.113.7",
};

function setup(sender?: EmailSender, options: { delivers?: boolean; overall?: number; failures?: number } = {}) {
  const sent: EmailMessage[] = [];
  const logger = new RecordingLogger();
  const contact = new ContactMessageUseCase(
    sender ?? { id: "test", send: async (email) => void sent.push(email) },
    INBOX,
    logger,
    options.delivers ?? true,
    new AttemptLimiter(2, 60 * 60 * 1000),
    new AttemptLimiter(options.overall ?? 100, 60 * 60 * 1000),
    new AttemptLimiter(options.failures ?? 10, 60 * 60 * 1000),
  );
  return { contact, sent, logger };
}

describe("the contact form", () => {
  it("emails the message to AlbumFlow, with replies going to the visitor", async () => {
    const { contact, sent } = setup();
    const result = await contact.send(message);
    assert.ok(result.isSuccess);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]!.to, [INBOX]);
    assert.equal(sent[0]!.replyTo, "ioana@example.com");
    assert.equal(sent[0]!.subject, "Contact form: Ioana Pop");
    assert.match(sent[0]!.text, /two photographers/);
    assert.match(sent[0]!.text, /Ioana Pop <ioana@example\.com>/);
  });

  it("drops a message whose hidden field was filled in, while answering as if it was sent", async () => {
    const { contact, sent } = setup();
    const result = await contact.send({ ...message, website: "http://spam.example" });
    assert.ok(result.isSuccess);
    assert.equal(sent.length, 0);
  });

  it("limits how many messages one address can send", async () => {
    const { contact, sent } = setup();
    await contact.send(message);
    await contact.send(message);
    const third = await contact.send(message);
    assert.ok(third.isFailure);
    assert.equal(third.getError().code, "TOO_MANY_ATTEMPTS");
    assert.match(third.getError().message, /Too many messages/);
    assert.equal(sent.length, 2);
    assert.ok((await contact.send({ ...message, ip: "198.51.100.1" })).isSuccess, "another address is not affected");

    // IPv6 counts by /64, so rotating addresses inside one network does not reset the limit.
    await contact.send({ ...message, ip: "2001:db8:1:2::1" });
    await contact.send({ ...message, ip: "2001:db8:1:2::2" });
    const rotated = await contact.send({ ...message, ip: "2001:db8:1:2::3" });
    assert.equal(rotated.isFailure && rotated.getError().code, "TOO_MANY_ATTEMPTS");
  });

  it("caps all messages together, whatever address they come from", async () => {
    const { contact, sent } = setup(undefined, { overall: 3 });
    for (let i = 0; i < 3; i++) assert.ok((await contact.send({ ...message, ip: `198.51.100.${i}` })).isSuccess);
    const fourth = await contact.send({ ...message, ip: "198.51.100.99" });
    assert.equal(fourth.isFailure && fourth.getError().code, "TOO_MANY_ATTEMPTS");
    assert.equal(sent.length, 3);
  });

  it("never says sent when no mail server is configured, and says why once", async () => {
    const { contact, sent, logger } = setup(undefined, { delivers: false });
    const result = await contact.send(message);
    assert.equal(result.isFailure && result.getError().code, "MESSAGE_NOT_SENT");
    await contact.send(message);
    assert.equal(sent.length, 0);
    assert.equal(logger.problems.length, 1, "logged once, not per request");
    assert.equal(logger.problems[0]?.level, "error");
    assert.match(logger.problems[0]!.message, /no mail server/);
  });

  it("does not count failed sends, so a visitor can retry through an outage", async () => {
    let failing = true;
    const delivered: EmailMessage[] = [];
    const { contact } = setup({
      id: "smtp",
      send: async (email) => {
        if (failing) throw new Error("connection refused");
        delivered.push(email);
      },
    });
    for (let i = 0; i < 4; i++) assert.equal((await contact.send(message)).isFailure, true);
    failing = false;
    assert.ok((await contact.send(message)).isSuccess, "four failures did not use up the limit of two");
    assert.equal(delivered.length, 1);
  });

  it("logs a failed send at error level and asks the visitor to try again", async () => {
    const { contact, logger } = setup({
      id: "smtp",
      send: async () => {
        throw new Error("connection refused");
      },
    });
    const result = await contact.send(message);
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "MESSAGE_NOT_SENT");
    const [entry] = logger.problems;
    assert.equal(entry?.level, "error");
    assert.equal(entry?.context?.["error"], "connection refused");
    assert.ok(!JSON.stringify(entry).includes("ioana@example.com"), "the visitor's address is not logged");
  });

  it("is served without an account, and checks what it is sent", async () => {
    const { contact, sent } = setup();
    const server = Fastify(httpServerOptions(undefined));
    registerHttpFoundation(server, { logger: new RecordingLogger(), metrics: new RequestMetrics() });
    registerStudioAuth(server, new InMemoryStudioRepository(), "test-only-jwt-secret-at-least-32-characters-long");
    const unused = {} as never;
    registerPlatformAdminRoutes(server, {
      access: unused,
      feedback: unused,
      dashboard: unused,
      plans: unused,
      contactMessage: contact,
    });
    await server.ready();

    const { ip: _ip, ...body } = message;
    const ok = await server.inject({ method: "POST", url: "/contact", payload: body });
    assert.equal(ok.statusCode, 202);
    assert.equal(sent.length, 1);

    const bad = await server.inject({ method: "POST", url: "/contact", payload: { ...body, email: "not-an-email" } });
    assert.equal(bad.statusCode, 400);

    await server.inject({ method: "POST", url: "/contact", payload: body });
    const limited = await server.inject({ method: "POST", url: "/contact", payload: body });
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);
    await server.close();
  });

  it("holds the limit against a burst of parallel requests", async () => {
    const { contact, sent } = setup();
    const results = await Promise.all(Array.from({ length: 6 }, () => contact.send(message)));
    assert.equal(results.filter((result) => result.isSuccess).length, 2);
    assert.equal(sent.length, 2);
  });

  it("caps failed sends per address, so an outage cannot be hammered", async () => {
    let calls = 0;
    const { contact } = setup(
      {
        id: "smtp",
        send: async () => {
          calls += 1;
          throw new Error("connection refused");
        },
      },
      { failures: 3 },
    );
    for (let i = 0; i < 3; i++) await contact.send(message);
    const fourth = await contact.send(message);
    assert.equal(fourth.isFailure && fourth.getError().code, "TOO_MANY_ATTEMPTS");
    assert.equal(calls, 3, "the mail server is not called once the failure budget is spent");
  });

  it("keeps failed sends in the overall cap", async () => {
    const { contact } = setup(
      {
        id: "smtp",
        send: async () => {
          throw new Error("connection refused");
        },
      },
      { overall: 2 },
    );
    await contact.send({ ...message, ip: "198.51.100.1" });
    await contact.send({ ...message, ip: "198.51.100.2" });
    const third = await contact.send({ ...message, ip: "198.51.100.3" });
    assert.equal(third.isFailure && third.getError().code, "TOO_MANY_ATTEMPTS");
  });
});
