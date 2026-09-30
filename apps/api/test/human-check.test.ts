import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NoHumanCheck, TurnstileHumanCheck } from "../src/shared-kernel/human-check";

function fakeCloudflare(answer: object | Error) {
  const calls: URLSearchParams[] = [];
  const fetchImpl = (async (_url: string, init: { body: URLSearchParams }) => {
    calls.push(init.body);
    if (answer instanceof Error) throw answer;
    return { json: async () => answer } as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("the signup human check", () => {
  it("passes everyone when switched off", async () => {
    assert.equal(await new NoHumanCheck().verify(undefined, undefined), true);
  });

  it("asks Cloudflare about the token, with the secret and the caller's address", async () => {
    const cloudflare = fakeCloudflare({ success: true });
    const check = new TurnstileHumanCheck("secret-key", cloudflare.fetchImpl, () => {});
    assert.equal(await check.verify("token-1", "203.0.113.9"), true);
    assert.equal(cloudflare.calls[0]?.get("secret"), "secret-key");
    assert.equal(cloudflare.calls[0]?.get("response"), "token-1");
    assert.equal(cloudflare.calls[0]?.get("remoteip"), "203.0.113.9");
  });

  it("refuses a missing or rejected token", async () => {
    const cloudflare = fakeCloudflare({ success: false, "error-codes": ["invalid-input-response"] });
    const check = new TurnstileHumanCheck("secret-key", cloudflare.fetchImpl, () => {});
    assert.equal(await check.verify(undefined, undefined), false);
    assert.equal(await check.verify("forged", undefined), false);
  });

  it("lets people in when Cloudflare cannot be reached", async () => {
    const check = new TurnstileHumanCheck("secret-key", fakeCloudflare(new Error("timeout")).fetchImpl, () => {});
    assert.equal(await check.verify("token", undefined), true);
  });
});
