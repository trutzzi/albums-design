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

function setup(sender?: EmailSender) {
  const sent: EmailMessage[] = [];
  const logger = new RecordingLogger();
  const contact = new ContactMessageUseCase(
    sender ?? { id: "test", send: async (email) => void sent.push(email) },
    INBOX,
    logger,
    new AttemptLimiter(2, 60 * 60 * 1000),
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
});
