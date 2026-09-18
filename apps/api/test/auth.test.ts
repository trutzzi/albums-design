import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { hashPassword, verifyPassword } from "../src/shared-kernel/password-hasher";
import { signJwt, verifyJwt } from "../src/shared-kernel/jwt";
import { StudioMember } from "../src/modules/identity/domain/studio-member";
import { RegisterUseCase } from "../src/modules/identity/application/use-cases/register.use-case";
import { LoginUseCase } from "../src/modules/identity/application/use-cases/login.use-case";
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
  return { studios, subscriptions, members };
}

describe("registering a personal account", () => {
  it("creates a studio, a trial subscription, and a login-capable owner", async () => {
    const { studios, subscriptions, members } = fixtures();
    const register = new RegisterUseCase(studios, subscriptions, members, SECRET);

    const result = await register.execute({
      name: "Alex Photography",
      email: "Alex@Example.com",
      password: "hunter2hunter2",
    });

    assert.ok(result.isSuccess);
    const { token, studioId } = result.getValue();
    assert.ok(token);
    assert.equal(studios.items.size, 1);
    assert.equal(subscriptions.items.get(studioId)?.planCode, "TRIAL");

    const member = [...members.items.values()][0];
    assert.equal(member?.email, "alex@example.com", "email is normalised to lowercase");
    assert.equal(member?.role, "OWNER");
    assert.ok(member?.passwordHash, "the owner must be able to log in immediately");

    const payload = verifyJwt(token, SECRET);
    assert.equal(payload?.["studioId"], studioId);
  });

  it("refuses a password shorter than 8 characters", async () => {
    const { studios, subscriptions, members } = fixtures();
    const register = new RegisterUseCase(studios, subscriptions, members, SECRET);
    const result = await register.execute({
      name: "Alex",
      email: "alex@example.com",
      password: "short",
    });
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "VALIDATION_ERROR");
  });

  it("refuses to register the same email twice", async () => {
    const { studios, subscriptions, members } = fixtures();
    const register = new RegisterUseCase(studios, subscriptions, members, SECRET);
    await register.execute({ name: "Alex", email: "alex@example.com", password: "hunter2hunter2" });

    const result = await register.execute({
      name: "Someone else",
      email: "alex@example.com",
      password: "differentpass",
    });
    assert.ok(result.isFailure);
    assert.equal(result.getError().code, "CONFLICT");
  });
});

describe("logging in", () => {
  it("issues a token for the correct password", async () => {
    const { studios, subscriptions, members } = fixtures();
    const register = new RegisterUseCase(studios, subscriptions, members, SECRET);
    await register.execute({ name: "Alex", email: "alex@example.com", password: "hunter2hunter2" });

    const login = new LoginUseCase(members, SECRET);
    const result = await login.execute({ email: "alex@example.com", password: "hunter2hunter2" });
    assert.ok(result.isSuccess);
    assert.ok(verifyJwt(result.getValue().token, SECRET));
  });

  it("refuses the wrong password without revealing the account exists", async () => {
    const { studios, subscriptions, members } = fixtures();
    const register = new RegisterUseCase(studios, subscriptions, members, SECRET);
    await register.execute({ name: "Alex", email: "alex@example.com", password: "hunter2hunter2" });

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
