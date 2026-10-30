import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { RegisterUseCase } from "../src/modules/identity/application/use-cases/register.use-case";
import { EmailConfirmationMailer } from "../src/modules/identity/application/services/email-confirmation.mailer";
import { SignupLog } from "../src/modules/identity/application/services/signup-log";
import { matchingBlock, networkOf, normaliseBlock, type SignupBlock } from "../src/modules/identity/domain/signup-log";
import {
  InMemorySignupAttemptRepository,
  InMemorySignupBlockRepository,
} from "../src/modules/identity/infrastructure/persistence/signup-log-repositories";
import { registerIdentityRoutes, type IdentityDependencies } from "../src/modules/identity/interface/http/routes";
import {
  registerPlatformAdminRoutes,
  type PlatformAdminDependencies,
} from "../src/modules/platform-admin/interface/http/routes";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import { AttemptLimiter } from "../src/shared-kernel/attempt-limiter";
import { RecordingLogger } from "./support/recording-logger";
import {
  InMemoryStudioMemberRepository,
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
} from "./support/in-memory";

const SECRET = "test-only-jwt-secret-at-least-32-characters-long";
const DAY = 24 * 60 * 60 * 1000;
const CONTEXT = {
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 Test",
  language: "ro-RO,ro;q=0.9",
  referer: "https://app.test/register",
};

function world(now = () => new Date("2026-10-30T12:00:00Z")) {
  const attempts = new InMemorySignupAttemptRepository();
  const blocks = new InMemorySignupBlockRepository();
  const logger = new RecordingLogger();
  const log = new SignupLog(attempts, blocks, logger, now);
  const sent: EmailMessage[] = [];
  const sender: EmailSender = { id: "test", send: async (message) => void sent.push(message) };
  const register = new RegisterUseCase(
    new InMemoryStudioRepository(),
    new InMemorySubscriptionRepository(),
    new InMemoryStudioMemberRepository(),
    SECRET,
    new EmailConfirmationMailer(sender),
    "https://app.test/",
    new AttemptLimiter(2, 60 * 60 * 1000),
    undefined,
    log,
  );
  const linkIn = (message: EmailMessage | undefined) =>
    decodeURIComponent(/verify-email\?token=([^\s"]+)/.exec(message?.text ?? "")?.[1] ?? "");
  return { attempts, blocks, logger, log, register, sent, linkIn };
}

const block = (kind: SignupBlock["kind"], value: string): SignupBlock => ({
  id: crypto.randomUUID(),
  kind,
  value: normaliseBlock(kind, value),
  note: null,
  createdAt: new Date(),
});

describe("sign-up block matching", () => {
  it("groups addresses into the networks a person or a provider uses", () => {
    assert.equal(networkOf("203.0.113.7"), "203.0.113.0/24");
    assert.equal(networkOf("::ffff:203.0.113.7"), "203.0.113.0/24");
    assert.equal(networkOf("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
    assert.equal(normaliseBlock("NETWORK", "203.0.113.99/24"), "203.0.113.0/24");
    assert.equal(normaliseBlock("EMAIL_DOMAIN", " @Spam.Example "), "spam.example");
  });

  it("matches an address, its network, and a domain with its subdomains", () => {
    assert.ok(matchingBlock([block("IP", "203.0.113.7")], "203.0.113.7", "a@b.ro"));
    assert.ok(matchingBlock([block("NETWORK", "203.0.113.0/24")], "203.0.113.200", "a@b.ro"));
    assert.ok(matchingBlock([block("EMAIL_DOMAIN", "spam.example")], undefined, "x@mail.spam.example"));
    assert.equal(matchingBlock([block("EMAIL_DOMAIN", "spam.example")], undefined, "x@notspam.example"), null);
    assert.equal(matchingBlock([block("IP", "203.0.113.7")], "203.0.113.8", "a@b.ro"), null);
  });
});

describe("the sign-up log", () => {
  it("records a sign-up with where it came from, and when its link is opened", async () => {
    const { attempts, register, sent, linkIn } = world();
    assert.ok(
      (await register.execute({ name: "Ana", email: "Ana@Example.com", password: "long-enough-1", context: CONTEXT }))
        .isSuccess,
    );
    const [attempt] = attempts.items;
    assert.equal(attempt?.outcome, "CONFIRMATION_SENT");
    assert.equal(attempt?.email, "ana@example.com");
    assert.deepEqual([attempt?.ip, attempt?.userAgent, attempt?.language, attempt?.referer], Object.values(CONTEXT));
    assert.ok(attempt?.memberId);

    await register.confirm(linkIn(sent[0]));
    assert.ok(attempts.items[0]?.confirmedAt);
  });

  it("records every refusal: too short, blocked, rate-limited, already registered", async () => {
    const { attempts, blocks, register, sent, linkIn } = world();
    await register.execute({ name: "A", email: "a@b.ro", password: "short", context: CONTEXT });

    await blocks.add(block("EMAIL_DOMAIN", "spam.example"));
    const blocked = await register.execute({
      name: "S",
      email: "s@spam.example",
      password: "long-enough-1",
      context: CONTEXT,
    });
    assert.equal(blocked.getError().code, "SIGNUP_BLOCKED");

    const other = { ...CONTEXT, ip: "198.51.100.1" };
    await register.execute({ name: "R", email: "r1@b.ro", password: "long-enough-1", context: other });
    await register.confirm(linkIn(sent[0]));
    await register.execute({ name: "R", email: "r1@b.ro", password: "long-enough-1", context: other });
    const limited = await register.execute({ name: "R", email: "r3@b.ro", password: "long-enough-1", context: other });
    assert.equal(limited.getError().code, "TOO_MANY_ATTEMPTS");

    assert.deepEqual(
      attempts.items.map((item) => item.outcome),
      ["INVALID", "BLOCKED", "CONFIRMATION_SENT", "ALREADY_REGISTERED", "RATE_LIMITED"],
    );
  });

  it("never fails a sign-up because its log entry could not be written", async () => {
    const { attempts, register, logger } = world();
    attempts.record = async () => {
      throw new Error("database down");
    };
    assert.ok(
      (await register.execute({ name: "Ana", email: "ana@b.ro", password: "long-enough-1", context: CONTEXT }))
        .isSuccess,
    );
    assert.equal(logger.entries.find((entry) => entry.level === "error")?.message, "sign-up attempt not logged");
  });

  it("shows whether each emailed link was opened, waiting or never opened, with 30-day counts", async () => {
    let now = new Date("2026-10-01T12:00:00Z");
    const { log, attempts } = world(() => now);
    await log.record("old@b.ro", CONTEXT, "CONFIRMATION_SENT", "m-old");
    await log.record("bot@b.ro", CONTEXT, "TRAPPED");
    now = new Date("2026-10-30T12:00:00Z");
    await log.record("new@b.ro", CONTEXT, "CONFIRMATION_SENT", "m-new");
    await log.record("yes@b.ro", CONTEXT, "CONFIRMATION_SENT", "m-yes");
    await log.confirmed("m-yes");

    const view = await log.list({ page: 1, pageSize: 50 });
    const byEmail = Object.fromEntries(view.items.map((item) => [item.email, item.confirmation]));
    assert.deepEqual(byEmail, {
      "old@b.ro": "NEVER",
      "bot@b.ro": null,
      "new@b.ro": "WAITING",
      "yes@b.ro": "CONFIRMED",
    });
    assert.equal(view.items.find((item) => item.email === "bot@b.ro")?.network, "203.0.113.0/24");
    assert.deepEqual(view.last30Days, { CONFIRMATION_SENT: 3, TRAPPED: 1 });
    assert.equal((await log.list({ search: "203.0.113", page: 1, pageSize: 2 })).total, 4);
    assert.equal((await log.list({ outcome: "TRAPPED", page: 1, pageSize: 50 })).total, 1);

    now = new Date(now.getTime() + 75 * DAY);
    assert.deepEqual(await log.purgeExpired(), { deleted: 2 });
    assert.equal(attempts.items.length, 2);
  });

  it("adds, de-duplicates, refuses nonsense and removes blocks", async () => {
    const { log } = world();
    const added = await log.block("NETWORK", "203.0.113.50", "bot farm");
    assert.equal(added.getValue().value, "203.0.113.0/24");
    assert.equal((await log.block("NETWORK", "203.0.113.9")).getValue().id, added.getValue().id);
    assert.equal((await log.block("EMAIL_DOMAIN", "localhost")).getError().code, "VALIDATION_ERROR");
    assert.match((await log.block("EMAIL_DOMAIN", "@Gmail.com")).getError().message, /too many real people/);
    assert.equal((await log.listBlocks()).length, 1);
    assert.ok((await log.unblock(added.getValue().id)).isSuccess);
    assert.equal((await log.unblock(added.getValue().id)).getError().code, "NOT_FOUND");
  });

  it("keeps the trap silent but logged, and refuses blocked sign-ups with 403", async () => {
    const { attempts, blocks, register, log } = world();
    await blocks.add(block("IP", "127.0.0.1"));
    const app = Fastify();
    registerIdentityRoutes(app, { register } as unknown as IdentityDependencies);
    registerPlatformAdminRoutes(app, {
      access: { isAdmin: async () => true },
      signups: log,
    } as unknown as PlatformAdminDependencies);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "curl/8.0" },
        body: JSON.stringify(body),
      });

    const trap = await post("/auth/register", {
      name: "Bot",
      email: "bot@b.ro",
      password: "long-enough-1",
      website: "x",
    });
    assert.equal(trap.status, 201);
    const blocked = await post("/auth/register", { name: "Me", email: "me@b.ro", password: "long-enough-1" });
    assert.equal(blocked.status, 403);
    assert.deepEqual(
      attempts.items.map((item) => [item.outcome, item.ip, item.userAgent]),
      [
        ["TRAPPED", "127.0.0.1", "curl/8.0"],
        ["BLOCKED", "127.0.0.1", "curl/8.0"],
      ],
    );

    const list = (await (await fetch(`${base}/admin/signups?outcome=TRAPPED`)).json()) as { total: number };
    assert.equal(list.total, 1);
    const created = await post("/admin/signup-blocks", { kind: "EMAIL_DOMAIN", value: "spam.example" });
    assert.equal(created.status, 201);
    const { id } = (await created.json()) as { id: string };
    assert.equal(((await (await fetch(`${base}/admin/signup-blocks`)).json()) as unknown[]).length, 2);
    assert.equal((await fetch(`${base}/admin/signup-blocks/${id}`, { method: "DELETE" })).status, 204);
    await app.close();
  });
});
