import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { hashPassword, verifyPassword } from "../src/shared-kernel/password-hasher";
import { signJwt, verifyJwt } from "../src/shared-kernel/jwt";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { RegisterUseCase } from "../src/modules/identity/application/use-cases/register.use-case";
import { LoginUseCase } from "../src/modules/identity/application/use-cases/login.use-case";
import { EmailConfirmationMailer } from "../src/modules/identity/application/services/email-confirmation.mailer";
import type { EmailMessage, EmailSender } from "../src/shared-kernel/email";
import {
  InMemoryStudioRepository,
  InMemorySubscriptionRepository,
  InMemoryStudioMemberRepository,
} from "./support/in-memory";

const SECRET = "test-only-jwt-secret-at-least-32-characters-long";

describe("password hashing", () => {
  it("verifies the exact password that was hashed", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.ok(await verifyPassword("correct horse battery staple", hash));
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("wrong password", hash), false);
  });

  it("salts every hash differently, even for the same password", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    assert.notEqual(a, b);
  });
});

describe("JWT sign/verify", () => {
  it("round-trips a payload", () => {
    const token = signJwt({ sub: "member-1", studioId: "studio-1" }, SECRET, 3600);
    const payload = verifyJwt(token, SECRET);
    assert.equal(payload?.sub, "member-1");
    assert.equal(payload?.["studioId"], "studio-1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signJwt({ sub: "member-1" }, "a-completely-different-secret-value", 3600);
    assert.equal(verifyJwt(token, SECRET), undefined);
  });

  it("rejects a tampered payload even if the signature parses", () => {
    const token = signJwt({ sub: "member-1", role: "OWNER" }, SECRET, 3600);
    const [header, , signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ sub: "member-1", role: "ADMIN" })).toString(
      "base64url",
    );
    assert.equal(verifyJwt(`${header}.${forgedBody}.${signature}`, SECRET), undefined);
  });

  it("rejects an expired token", () => {
    const token = signJwt({ sub: "member-1" }, SECRET, -1);
    assert.equal(verifyJwt(token, SECRET), undefined);
  });
});

function fixtures() {
  const studios = new InMemoryStudioRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const members = new InMemoryStudioMemberRepository();
  const sent: EmailMessage[] = [];
  const sender: EmailSender = { id: "test", send: async (message) => void sent.push(message) };
  const register = new RegisterUseCase(
    studios,
    subscriptions,
    members,
    SECRET,
    new EmailConfirmationMailer(sender),
    "https://app.test/",
  );
  const linkIn = (message: EmailMessage | undefined) =>
    decodeURIComponent(/verify-email\?token=([^\s"]+)/.exec(message?.text ?? "")?.[1] ?? "");
  /** Signs up and opens the emailed link, like a real person would. */
  const signUpConfirmed = async (email: string, password: string) => {
    await register.execute({ name: "Alex", email, password });
    return register.confirm(linkIn(sent[sent.length - 1]));
  };
  return { studios, subscriptions, members, register, sent, linkIn, signUpConfirmed };
}

describe("registering a personal account", () => {
  it("creates a studio on the default plan and emails a confirmation link instead of logging in", async () => {
    const { studios, subscriptions, members, register, sent } = fixtures();

    const result = await register.execute({
      name: "Alex Photography",
      email: "Alex@Example.com",
      password: "hunter2hunter2",
      language: "ro",
    });

    assert.ok(result.isSuccess);
    assert.deepEqual(result.getValue(), { status: "CONFIRMATION_SENT", email: "alex@example.com" });
    assert.equal(studios.items.size, 1);
    const studioId = [...studios.items.keys()][0]!;
    assert.equal(subscriptions.items.get(studioId)?.planCode, "STUDIO");

    const member = [...members.items.values()][0];
    assert.equal(member?.email, "alex@example.com", "email is normalised to lowercase");
    assert.equal(member?.role, "OWNER");
    assert.equal(member?.emailVerified, false);

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]?.to, ["alex@example.com"]);
    assert.match(sent[0]?.subject ?? "", /Confirmă/);
    assert.match(sent[0]?.text ?? "", /https:\/\/app\.test\/verify-email\?token=/);
  });

  it("opens the account from the emailed link and signs in", async () => {
    const { members, register, sent, linkIn } = fixtures();
    await register.execute({ name: "Alex", email: "alex@example.com", password: "hunter2hunter2" });

    const confirmed = await register.confirm(linkIn(sent[0]));
    assert.ok(confirmed.isSuccess);
    const payload = verifyJwt(confirmed.getValue().token, SECRET);
    assert.equal(payload?.["studioId"], confirmed.getValue().studioId);
    assert.equal([...members.items.values()][0]?.emailVerified, true);

    assert.equal((await register.confirm("not-a-token")).getError().code, "UNAUTHORIZED");
  });

  it("refuses a password shorter than 8 characters", async () => {
    const { register } = fixtures();
    const result = await register.execute({ name: "Alex", email: "alex@example.com", password: "short" });
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "VALIDATION_ERROR");
  });

  it("refuses an address that already has a confirmed account", async () => {
    const { register, signUpConfirmed } = fixtures();
    await signUpConfirmed("alex@example.com", "hunter2hunter2");

    const result = await register.execute({ name: "Someone else", email: "alex@example.com", password: "differentpass" });
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "CONFLICT");
  });

  it("lets the real owner take over an address someone signed up with but never confirmed", async () => {
    const { studios, register, sent } = fixtures();
    await register.execute({ name: "Squatter", email: "alex@example.com", password: "squatter-pass" });
    const again = await register.execute({ name: "Alex", email: "alex@example.com", password: "real-owner-pass" });
    assert.ok(again.isSuccess);
    assert.equal(studios.items.size, 1, "no second studio for the same address");
    assert.equal(sent.length, 2);
  });

  it("stops one address from creating accounts in bulk", async () => {
    const { register } = fixtures();
    for (let index = 0; index < 5; index++) {
      const ok = await register.execute({ name: "Bot", email: `bot${index}@spam.test`, password: "password123", ip: "203.0.113.9" });
      assert.ok(ok.isSuccess);
    }
    const blocked = await register.execute({ name: "Bot", email: "bot9@spam.test", password: "password123", ip: "203.0.113.9" });
    assert.equal(blocked.getError().code, "TOO_MANY_ATTEMPTS");
    const person = await register.execute({ name: "Ana", email: "ana@studio.ro", password: "password123", ip: "198.51.100.4" });
    assert.ok(person.isSuccess, "other addresses are unaffected");
  });

  it("resends the link only to accounts still waiting", async () => {
    const { register, sent, signUpConfirmed } = fixtures();
    await register.execute({ name: "Alex", email: "alex@example.com", password: "hunter2hunter2" });
    await register.resend({ email: "ALEX@example.com", language: "en" });
    assert.equal(sent.length, 2);

    await signUpConfirmed("ana@example.com", "hunter2hunter2");
    const before = sent.length;
    await register.resend({ email: "ana@example.com", language: "en" });
    await register.resend({ email: "nobody@example.com", language: "en" });
    assert.equal(sent.length, before);
  });
});

describe("logging in", () => {
  it("issues a token for the correct password once the email is confirmed", async () => {
    const { members, signUpConfirmed } = fixtures();
    await signUpConfirmed("alex@example.com", "hunter2hunter2");

    const login = new LoginUseCase(members, SECRET);
    const result = await login.execute({ email: "alex@example.com", password: "hunter2hunter2" });
    assert.ok(result.isSuccess);
    assert.ok(verifyJwt(result.getValue().token, SECRET));
  });

  it("keeps an unconfirmed account out, but only tells someone who knows the password", async () => {
    const { members, register } = fixtures();
    await register.execute({ name: "Alex", email: "alex@example.com", password: "hunter2hunter2" });

    const login = new LoginUseCase(members, SECRET);
    const right = await login.execute({ email: "alex@example.com", password: "hunter2hunter2" });
    const wrong = await login.execute({ email: "alex@example.com", password: "nope-nope" });
    assert.equal(right.getError().code, "EMAIL_NOT_VERIFIED");
    assert.equal(wrong.getError().code, "UNAUTHORIZED");
  });

  it("refuses the wrong password without revealing the account exists", async () => {
    const { members, signUpConfirmed } = fixtures();
    await signUpConfirmed("alex@example.com", "hunter2hunter2");

    const login = new LoginUseCase(members, SECRET);
    const wrongPassword = await login.execute({ email: "alex@example.com", password: "nope-nope" });
    const unknownEmail = await login.execute({ email: "nobody@example.com", password: "nope-nope" });

    assert.ok(wrongPassword.isFailure);
    assert.ok(unknownEmail.isFailure);
    assert.equal(wrongPassword.getError().code, "UNAUTHORIZED");
    assert.equal(wrongPassword.getError().message, unknownEmail.getError().message);
  });

  it("refuses a member who was invited but never signed up", async () => {
    const { members } = fixtures();
    const studioId = UniqueEntityId.create();
    await members.save(
      StudioMember.invite({
        studioId,
        email: "invited@example.com",
        name: "Invited Editor",
        role: "EDITOR",
      }),
    );

    const login = new LoginUseCase(members, SECRET);
    const result = await login.execute({ email: "invited@example.com", password: "anything123" });
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "UNAUTHORIZED");
  });
});
