import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEDIA_URL_WINDOW_SECONDS, MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";

const SECRET = "test-secret-test-secret-test-secret-123";
const realNow = () => Math.floor(Date.now() / 1000);
const tokenOf = (url: string) => url.slice(url.indexOf("/media/") + "/media/".length);

describe("MediaUrlSigner: links the browser can cache", () => {
  it("gives the same link for the same photo throughout one window", () => {
    const start = Math.floor(realNow() / MEDIA_URL_WINDOW_SECONDS) * MEDIA_URL_WINDOW_SECONDS;
    let clock = start + 5;
    const signer = new MediaUrlSigner(SECRET, "https://api.example.test", () => clock);
    const first = signer.sign("studios/s/preview.jpg", 3600);
    clock = start + MEDIA_URL_WINDOW_SECONDS - 5;
    assert.equal(signer.sign("studios/s/preview.jpg", 3600), first);
    assert.notEqual(signer.sign("studios/s/thumb.jpg", 3600), first);
  });

  it("gives a new link in the next window", () => {
    let clock = realNow();
    const signer = new MediaUrlSigner(SECRET, "https://api.example.test", () => clock);
    const first = signer.sign("k.jpg", 3600);
    clock += MEDIA_URL_WINDOW_SECONDS;
    assert.notEqual(signer.sign("k.jpg", 3600), first);
  });

  it("still lasts the full lifetime asked for, even when issued late in a window", () => {
    const start = Math.floor(realNow() / MEDIA_URL_WINDOW_SECONDS) * MEDIA_URL_WINDOW_SECONDS;
    const late = start + MEDIA_URL_WINDOW_SECONDS - 1;
    const signer = new MediaUrlSigner(SECRET, "https://api.example.test", () => late);
    const granted = signer.inspect(tokenOf(signer.sign("k.jpg", 3600)));
    assert.equal(granted?.key, "k.jpg");
    assert.ok((granted?.secondsLeft ?? 0) >= 3600, `${granted?.secondsLeft}`);
  });

  it("refuses a tampered link or one signed with another secret", () => {
    const signer = new MediaUrlSigner(SECRET, "https://api.example.test");
    const token = tokenOf(signer.sign("k.jpg", 3600));
    assert.equal(signer.verify(token), "k.jpg");
    assert.equal(signer.verify(`${token.slice(0, -2)}xx`), undefined);
    assert.equal(new MediaUrlSigner("another-secret-another-secret-123456", "https://x").verify(token), undefined);
  });
});
