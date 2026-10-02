import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DigiStorageProvider } from "../src/infrastructure/storage/digistorage-storage-provider";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";
import { AdminDashboardUseCase } from "../src/modules/platform-admin/application/use-cases/admin.use-cases";
import { InMemoryFeedbackRepository } from "../src/modules/platform-admin/infrastructure/feedback-repositories";
import { InProcessDependencyProbe } from "../src/modules/platform-admin/infrastructure/dependency-probes";
import { RequestMetrics } from "../src/interface/request-metrics";
import type { StorageProvider } from "../src/shared-kernel/storage-provider";

const MIB = 1024 * 1024;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function provider(webdavUrl = "https://storage.example.test/dav/Digi%20Cloud") {
  return new DigiStorageProvider({
    webdavUrl,
    username: "studio@example.test",
    appPassword: "app-password",
    rootPath: "albumflow",
    urlSigner: new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test"),
  });
}

function answer(status: number, body: unknown, seen?: { url?: string; auth?: string }) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    if (seen) {
      seen.url = String(input);
      seen.auth = new Headers(init?.headers).get("authorization") ?? undefined;
    }
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("DigiStorage space", () => {
  it("reads the storage area named in the WebDAV URL, in bytes", async () => {
    const seen: { url?: string; auth?: string } = {};
    answer(
      200,
      {
        mounts: [
          { name: "Shared", isPrimary: false, spaceTotal: 10, spaceUsed: 9 },
          { name: "Digi Cloud", isPrimary: true, spaceTotal: 1044480, spaceUsed: 791961 },
        ],
      },
      seen,
    );
    const usage = await provider().usage();
    assert.equal(seen.url, "https://storage.example.test/api/v2/mounts");
    assert.equal(seen.auth, `Basic ${Buffer.from("studio@example.test:app-password").toString("base64")}`);
    assert.deepEqual(usage, { usedBytes: 791961 * MIB, totalBytes: 1044480 * MIB });
  });

  it("falls back to the primary area", async () => {
    answer(200, { mounts: [{ name: "Other", isPrimary: true, spaceTotal: 100, spaceUsed: 40 }] });
    const usage = await provider("https://storage.example.test/dav/Unknown").usage();
    assert.equal(usage.usedBytes, 40 * MIB);
  });

  it("fails clearly when DigiStorage refuses", async () => {
    answer(401, { error: "unauthorized" });
    await assert.rejects(provider().usage(), /401/);
  });
});

describe("storage space on the admin dashboard", () => {
  function dashboard(storage: StorageProvider | undefined, clock: { now: number }) {
    return new AdminDashboardUseCase(
      {
        load: async () => ({
          studios: [],
          subscriptions: [],
          projects: [],
          photoDays: [],
          albums: [],
          reviews: [],
          picks: [],
          exports: [],
        }),
      },
      new InMemoryFeedbackRepository(),
      new InProcessDependencyProbe(),
      new RequestMetrics(),
      {
        mode: "production",
        storage: "digistorage",
        email: "smtp",
        billing: "none",
        vision: "heuristic",
        errorMonitoring: false,
      },
      storage,
      () => clock.now,
    );
  }

  it("asks the provider at most once every five minutes", async () => {
    let asked = 0;
    const storage = {
      id: "digistorage",
      usage: async () => ({ usedBytes: ++asked, totalBytes: 100 }),
    } as unknown as StorageProvider;
    const clock = { now: Date.parse("2026-09-30T10:00:00Z") };
    const subject = dashboard(storage, clock);
    await subject.system();
    await subject.system();
    clock.now += 6 * 60 * 1000;
    const later = await subject.system();
    assert.equal(asked, 2);
    assert.equal(later.storageSpace && "usedBytes" in later.storageSpace ? later.storageSpace.usedBytes : -1, 2);
  });

  it("reports the failure instead of failing the dashboard", async () => {
    const storage = {
      id: "digistorage",
      usage: async () => Promise.reject(new Error("timeout")),
    } as unknown as StorageProvider;
    const stats = await dashboard(storage, { now: Date.now() }).system();
    assert.equal(stats.storageSpace && "error" in stats.storageSpace ? stats.storageSpace.error : "", "timeout");
  });

  it("shows nothing without a long-term store", async () => {
    const stats = await dashboard(undefined, { now: Date.now() }).system();
    assert.equal(stats.storageSpace, null);
  });
});
