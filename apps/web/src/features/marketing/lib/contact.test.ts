import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactErrorKey } from "./contact";

/** What `ApiError` carries, without loading the browser-only API client. */
const apiError = (code: string) => Object.assign(new Error("in English"), { code });

describe("contactErrorKey", () => {
  it("names the limit and a failed send, and anything else generically", () => {
    assert.equal(contactErrorKey(apiError("TOO_MANY_ATTEMPTS")), "contact.error.tooMany");
    assert.equal(contactErrorKey(apiError("MESSAGE_NOT_SENT")), "contact.error.notSent");
    assert.equal(contactErrorKey(apiError("VALIDATION")), "contact.error.generic");
    assert.equal(contactErrorKey(new TypeError("Failed to fetch")), "contact.error.generic");
    assert.equal(contactErrorKey(null), "contact.error.generic");
  });
});
