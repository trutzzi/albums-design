import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Writable } from "node:stream";
import { MAX_BUFFERED_BYTES, streamZip } from "../src/interface/zip-stream";

const PHOTO = 4 * 1024 * 1024;

describe("streaming a ZIP to a slow client", () => {
  it("never reads photos far ahead of what the client has received", async () => {
    let received = 0;
    let worstLead = 0;
    // A client on a slow connection: takes 1 MB every 5 ms.
    const client = new Writable({
      highWaterMark: 64 * 1024,
      write(chunk: Buffer, _encoding, done) {
        received += chunk.length;
        setTimeout(done, chunk.length >= 1024 * 1024 ? 5 : 0);
      },
    });
    let read = 0;
    const entries = Array.from({ length: 20 }, (_, index) => ({
      name: `IMG_${index}.jpg`,
      read: async () => {
        read += PHOTO;
        worstLead = Math.max(worstLead, read - received);
        return Buffer.alloc(PHOTO, index);
      },
    }));

    const delivered = await streamZip(client, entries, () => false);
    assert.equal(delivered, true);
    assert.ok(received >= 20 * PHOTO, "every photo reached the client");
    // At most what is allowed to wait, plus the photo being read and the one being written.
    assert.ok(
      worstLead <= MAX_BUFFERED_BYTES + 2 * PHOTO,
      `read ${Math.round(worstLead / 1048576)} MB ahead of the client`,
    );
  });
});
