import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { OffsiteDatabaseBackups } from "../src/infrastructure/backup/offsite-database-backups";
import { InMemoryStorageProvider } from "../src/dev/in-memory-storage-provider";
import { MediaUrlSigner } from "../src/infrastructure/storage/media-url-signer";

async function setup(keep = 30) {
  const directory = await mkdtemp(join(tmpdir(), "albumflow-backups-"));
  const provider = new InMemoryStorageProvider(
    new MediaUrlSigner("test-secret-test-secret-test-secret-123", "https://api.example.test"),
  );
  return { directory, provider, backups: new OffsiteDatabaseBackups(provider, directory, keep) };
}

describe("off-site database backups", () => {
  it("copies finished dumps and skips ones already stored", async () => {
    const { directory, provider, backups } = await setup();
    await writeFile(join(directory, "albumflow-2026-09-28T0300Z.dump"), "dump one");
    await writeFile(join(directory, "albumflow-2026-09-29T0300Z.dump"), "dump two");

    const first = await backups.run();
    assert.deepEqual(first.uploaded, ["albumflow-2026-09-28T0300Z.dump", "albumflow-2026-09-29T0300Z.dump"]);
    assert.equal(
      provider.objects.get("backups/database/albumflow-2026-09-29T0300Z.dump")?.toString(),
      "dump two",
    );

    const second = await backups.run();
    assert.equal(second.uploaded.length, 0);
    assert.equal(second.alreadyThere, 2);
  });

  it("never copies a dump that is still being written", async () => {
    const { directory, provider, backups } = await setup();
    await writeFile(join(directory, ".albumflow-2026-09-30T0300Z.dump.partial"), "half");
    const summary = await backups.run();
    assert.equal(summary.uploaded.length, 0);
    assert.equal(provider.objects.size, 0);
  });

  it("keeps only the newest copies off-site", async () => {
    const { directory, provider, backups } = await setup(2);
    for (const day of ["26", "27", "28", "29"]) {
      await writeFile(join(directory, `albumflow-2026-09-${day}T0300Z.dump`), `dump ${day}`);
    }
    const summary = await backups.run();
    assert.equal(summary.pruned, 2);
    assert.deepEqual(
      [...provider.objects.keys()].sort(),
      ["backups/database/albumflow-2026-09-28T0300Z.dump", "backups/database/albumflow-2026-09-29T0300Z.dump"],
    );
  });
});
