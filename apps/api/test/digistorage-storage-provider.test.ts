import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:net";
import { v2 as webdav } from "webdav-server";
import { createClient } from "webdav";
import { DigiStorageProvider } from "../src/infrastructure/storage/digistorage-storage-provider";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";
import { StorageObjectNotFoundError } from "../src/shared-kernel/storage-provider";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
    probe.on("error", reject);
  });
}

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const PROJECT = "studios/s1/projects/p1";

// A real WebDAV server, in-process: the adapter is exercised over the actual
// protocol (PUT, MOVE, MKCOL, PROPFIND, DELETE), not against a mock of the
// client library, so a wrong assumption about WebDAV behaviour fails here.
describe("DigiStorageProvider over a real WebDAV server", () => {
  let server: webdav.WebDAVServer;
  let baseUrl: string;
  let provider: DigiStorageProvider;
  const signer = new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test");

  before(async () => {
    const port = await freePort();
    // Real HTTP Basic auth, so a wrong or missing credential would surface here.
    const userManager = new webdav.SimpleUserManager();
    const user = userManager.addUser("someone@example.test", "app-password", false);
    const privilegeManager = new webdav.SimplePathPrivilegeManager();
    privilegeManager.setRights(user, "/", ["all"]);
    server = new webdav.WebDAVServer({
      port,
      httpAuthentication: new webdav.HTTPBasicAuthentication(userManager, "test"),
      privilegeManager,
    });
    await server.startAsync(port);
    baseUrl = `http://127.0.0.1:${port}`;
    provider = new DigiStorageProvider({
      webdavUrl: baseUrl,
      username: "someone@example.test",
      appPassword: "app-password",
      rootPath: "albumflow",
      urlSigner: signer,
    });
  });

  after(async () => {
    await server.stopAsync();
  });

  it("uploads, reports the size, and streams the same bytes back", async () => {
    const body = Buffer.from("preview-bytes-".repeat(1000));
    await provider.upload(`${PROJECT}/derivatives/a-preview.jpg`, body, { contentType: "image/jpeg" });

    const head = await provider.head(`${PROJECT}/derivatives/a-preview.jpg`);
    assert.equal(head?.size, body.byteLength);
    assert.deepEqual(await collect(await provider.openRead(`${PROJECT}/derivatives/a-preview.jpg`)), body);
  });

  it("overwrites an existing key instead of failing", async () => {
    const key = `${PROJECT}/originals/o.jpg`;
    await provider.upload(key, Buffer.from("first"), { contentType: "image/jpeg" });
    await provider.upload(key, Buffer.from("second, longer"), { contentType: "image/jpeg" });
    assert.equal((await provider.head(key))?.size, "second, longer".length);
  });

  it("leaves no .part file behind after a successful upload", async () => {
    const key = `${PROJECT}/originals/clean.jpg`;
    await provider.upload(key, Buffer.from("x"), { contentType: "image/jpeg" });
    const raw = createClient(baseUrl, { username: "someone@example.test", password: "app-password" });
    const names = (await raw.getDirectoryContents(`/albumflow/${PROJECT}/originals`)) as { basename: string }[];
    assert.ok(!names.some((entry) => entry.basename.endsWith(".part")));
  });

  it("reports a missing object as undefined and refuses to stream it", async () => {
    assert.equal(await provider.head(`${PROJECT}/originals/nope.jpg`), undefined);
    await assert.rejects(
      () => provider.openRead(`${PROJECT}/originals/nope.jpg`),
      StorageObjectNotFoundError,
    );
  });

  it("lists everything under a prefix recursively, with keys relative to the root", async () => {
    await provider.upload("studios/s2/projects/p9/originals/1.jpg", Buffer.from("1"), { contentType: "image/jpeg" });
    await provider.upload("studios/s2/projects/p9/derivatives/1-preview.jpg", Buffer.from("22"), { contentType: "image/jpeg" });
    await provider.upload("studios/s2/projects/other/originals/2.jpg", Buffer.from("333"), { contentType: "image/jpeg" });

    const listed = await provider.list("studios/s2/projects/p9/");
    assert.deepEqual(
      listed.map((entry) => [entry.key, entry.size]),
      [
        ["studios/s2/projects/p9/derivatives/1-preview.jpg", 2],
        ["studios/s2/projects/p9/originals/1.jpg", 1],
      ],
    );
  });

  it("treats a prefix that does not exist as empty", async () => {
    assert.deepEqual(await provider.list("studios/ghost/projects/none"), []);
  });

  it("deletes one key idempotently", async () => {
    const key = `${PROJECT}/originals/d.jpg`;
    await provider.upload(key, Buffer.from("d"), { contentType: "image/jpeg" });
    await provider.delete(key);
    await provider.delete(key);
    assert.equal(await provider.head(key), undefined);
  });

  it("deletes a whole project prefix and can upload into it again afterwards", async () => {
    const prefix = "studios/s3/projects/gone";
    await provider.upload(`${prefix}/originals/1.jpg`, Buffer.from("1"), { contentType: "image/jpeg" });
    await provider.upload(`${prefix}/derivatives/1-thumb.jpg`, Buffer.from("2"), { contentType: "image/jpeg" });

    await provider.deletePrefix(prefix);
    await provider.deletePrefix(prefix);
    assert.deepEqual(await provider.list(prefix), []);

    // The cached "this folder exists" knowledge must not survive the delete.
    await provider.upload(`${prefix}/originals/2.jpg`, Buffer.from("again"), { contentType: "image/jpeg" });
    assert.equal((await provider.head(`${prefix}/originals/2.jpg`))?.size, 5);
  });

  it("recovers when another process removed the folder this one had cached", async () => {
    const key = "studios/s4/projects/racy/originals/1.jpg";
    await provider.upload(key, Buffer.from("1"), { contentType: "image/jpeg" });
    await createClient(baseUrl, { username: "someone@example.test", password: "app-password" }).deleteFile("/albumflow/studios/s4/projects/racy");
    await provider.upload(key, Buffer.from("22"), { contentType: "image/jpeg" });
    assert.equal((await provider.head(key))?.size, 2);
  });

  it("refuses keys that could escape the root", async () => {
    for (const key of ["../x", "a/../../x", "/abs", "a//b", "", "a\\b"]) {
      await assert.rejects(() => provider.upload(key, Buffer.from("x"), { contentType: "text/plain" }), /Unsafe storage key/, key);
    }
  });

  it("hands out a signed API URL for reads, never a WebDAV URL", async () => {
    const key = `${PROJECT}/derivatives/a-preview.jpg`;
    const url = await provider.getUrl(key, { expiresInSeconds: 60 });
    assert.ok(url.startsWith("https://api.example.test/media/"));
    assert.ok(!url.includes(baseUrl));
    assert.equal(signer.verify(url.split("/media/")[1]!), key);
  });
});
