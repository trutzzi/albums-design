import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import { AttemptLimiter } from "../src/shared-kernel/attempt-limiter";
import { verifyJwt } from "../src/shared-kernel/jwt";
import { RegisterUseCase } from "../src/modules/identity/application/use-cases/register.use-case";
import { LoginUseCase } from "../src/modules/identity/application/use-cases/login.use-case";
import { PasswordResetUseCase } from "../src/modules/identity/application/use-cases/password-reset.use-case";
import { PasswordResetMailer } from "../src/modules/identity/application/services/password-reset.mailer";
import { EmailConfirmationMailer } from "../src/modules/identity/application/services/email-confirmation.mailer";
import {
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
  InMemoryStudioMemberRepository,
} from "./support/in-memory";

const SECRET = "test-only-jwt-secret-at-least-32-characters-long";

async function setup() {
  const members = new InMemoryStudioMemberRepository();
  const confirmations: EmailMessage[] = [];
  const register = new RegisterUseCase(
    new InMemoryStudioRepository(),
    new InMemorySubscriptionRepository(),
    members,
    SECRET,
    new EmailConfirmationMailer({ id: "test", send: async (message) => void confirmations.push(message) }),
    "https://app.test/",
  );
  await register.execute({ name: "Alex", email: "alex@example.com", password: "original-pass" });
  await register.confirm(decodeURIComponent(/token=([^\s"]+)/.exec(confirmations[0]?.text ?? "")?.[1] ?? ""));

  const sent: EmailMessage[] = [];
  const sender: EmailSender = { id: "test", send: async (message) => void sent.push(message) };
  const reset = new PasswordResetUseCase(members, new PasswordResetMailer(sender), SECRET, "https://app.test/");
  const tokenFrom = (message: EmailMessage | undefined) =>
    decodeURIComponent(/token=([^\s"]+)/.exec(message?.text ?? "")?.[1] ?? "");
  return { members, reset, sent, tokenFrom };
}

describe("password reset", () => {
  it("emails a link that sets a new password and logs the member in", async () => {
    const { members, reset, sent, tokenFrom } = await setup();
    await reset.request({ email: "Alex@Example.com", language: "en" });

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]?.to, ["alex@example.com"]);
    assert.match(sent[0]!.text, /https:\/\/app\.test\/reset-password\?token=/);

    const result = await reset.reset({ token: tokenFrom(sent[0]), password: "brand-new-pass" });
    assert.ok(result.isSuccess);
    assert.ok(verifyJwt(result.getValue().token, SECRET));

    const login = new LoginUseCase(members, SECRET);
    assert.ok((await login.execute({ email: "alex@example.com", password: "brand-new-pass" })).isSuccess);
    assert.ok((await login.execute({ email: "alex@example.com", password: "original-pass" })).isFailure);
  });

  it("sends nothing, and still succeeds, for an address with no account", async () => {
    const { reset, sent } = await setup();
    await reset.request({ email: "nobody@example.com", language: "en" });
    assert.equal(sent.length, 0);
  });

  it("accepts a link only once", async () => {
    const { reset, sent, tokenFrom } = await setup();
    await reset.request({ email: "alex@example.com", language: "en" });
    const token = tokenFrom(sent[0]);

    assert.ok((await reset.reset({ token, password: "first-new-pass" })).isSuccess);
    const again = await reset.reset({ token, password: "second-new-pass" });
    assert.ok(again.isFailure);
    assert.equal(again.getError().code, "UNAUTHORIZED");
  });

  it("refuses a login token passed off as a reset token", async () => {
    const { members, reset } = await setup();
    const login = await new LoginUseCase(members, SECRET).execute({
      email: "alex@example.com",
      password: "original-pass",
    });
    const result = await reset.reset({ token: login.getValue().token, password: "brand-new-pass" });
    assert.ok(result.isFailure);
  });

  it("refuses a short new password", async () => {
    const { reset, sent, tokenFrom } = await setup();
    await reset.request({ email: "alex@example.com", language: "en" });
    const result = await reset.reset({ token: tokenFrom(sent[0]), password: "short" });
    assert.equal(result.getError().code, "VALIDATION_ERROR");
  });

  it("writes the email in Romanian when asked", async () => {
    const { reset, sent } = await setup();
    await reset.request({ email: "alex@example.com", language: "ro" });
    assert.match(sent[0]!.subject, /Resetează/);
  });

  it("stops emailing one address after a handful of requests", async () => {
    const { reset, sent } = await setup();
    for (let i = 0; i < 8; i++) await reset.request({ email: "alex@example.com", language: "en" });
    assert.equal(sent.length, 5);
  });
});

describe("login lockout", () => {
  it("locks an account after repeated wrong passwords, even for the right one", async () => {
    const { members } = await setup();
    const login = new LoginUseCase(members, SECRET, {
      perEmail: new AttemptLimiter(3),
      perIp: new AttemptLimiter(100),
    });
    for (let i = 0; i < 3; i++) await login.execute({ email: "alex@example.com", password: "wrong-pass" });

    const locked = await login.execute({ email: "alex@example.com", password: "original-pass" });
    assert.ok(locked.isFailure);
    assert.equal(locked.getError().code, "TOO_MANY_ATTEMPTS");
  });

  it("locks one address spraying many accounts", async () => {
    const { members } = await setup();
    const login = new LoginUseCase(members, SECRET, {
      perEmail: new AttemptLimiter(100),
      perIp: new AttemptLimiter(3),
    });
    for (const email of ["a@x.test", "b@x.test", "c@x.test"]) {
      await login.execute({ email, password: "guess", ip: "203.0.113.9" });
    }
    const fromSameIp = await login.execute({ email: "alex@example.com", password: "original-pass", ip: "203.0.113.9" });
    const fromElsewhere = await login.execute({
      email: "alex@example.com",
      password: "original-pass",
      ip: "198.51.100.1",
    });
    assert.equal(fromSameIp.getError().code, "TOO_MANY_ATTEMPTS");
    assert.ok(fromElsewhere.isSuccess);
  });

  it("clears the account's count after a successful login", async () => {
    const { members } = await setup();
    const login = new LoginUseCase(members, SECRET, {
      perEmail: new AttemptLimiter(3),
      perIp: new AttemptLimiter(100),
    });
    await login.execute({ email: "alex@example.com", password: "wrong-pass" });
    await login.execute({ email: "alex@example.com", password: "wrong-pass" });
    assert.ok((await login.execute({ email: "alex@example.com", password: "original-pass" })).isSuccess);
    await login.execute({ email: "alex@example.com", password: "wrong-pass" });
    await login.execute({ email: "alex@example.com", password: "wrong-pass" });
    assert.ok((await login.execute({ email: "alex@example.com", password: "original-pass" })).isSuccess);
  });
});
