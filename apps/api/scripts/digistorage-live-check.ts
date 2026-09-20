/**
 * Live connectivity check against the real DigiStorage account configured in
 * the repo-root .env. Writes, reads, lists and deletes one tiny object under a
 * throwaway prefix, then removes the prefix. Run:
 *
 *   node --env-file=../../.env --import tsx scripts/digistorage-live-check.ts
 */
import { buildStorage } from "../src/infrastructure/storage/build-storage-provider";
import { loadEnv } from "../src/shared-kernel/env";

async function main() {
  const env = loadEnv({ ...process.env, STORAGE_PROVIDER: "digistorage" });
  const { provider } = buildStorage(env);
  if (!provider) throw new Error("No provider built");

  const prefix = `_connectivity-check/${Date.now()}`;
  const key = `${prefix}/hello.txt`;
  const body = Buffer.from("albumflow live check");

  const step = async (label: string, run: () => Promise<unknown>) => {
    const started = Date.now();
    try {
      const result = await run();
      console.log(`ok   ${label} (${Date.now() - started}ms)`, result ?? "");
    } catch (error) {
      console.log(`FAIL ${label}: ${(error as Error).message}`);
      await provider.deletePrefix(prefix).catch(() => undefined);
      process.exit(1);
    }
  };

  await step("upload", () => provider.upload(key, body, { contentType: "text/plain" }));
  await step("head", async () => {
    const info = await provider.head(key);
    if (info?.size !== body.length) throw new Error(`size mismatch: ${JSON.stringify(info)}`);
    return info;
  });
  await step("list", async () => {
    const items = await provider.list(prefix);
    if (items.length !== 1) throw new Error(`expected 1 object, got ${items.length}`);
    return items.map((item) => item.key);
  });
  await step("read back", async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of await provider.openRead(key)) chunks.push(chunk as Buffer);
    if (Buffer.concat(chunks).toString() !== body.toString()) throw new Error("content mismatch");
  });
  await step("delete prefix", () => provider.deletePrefix(prefix));
  await step("confirm gone", async () => {
    if (await provider.head(key)) throw new Error("object still present");
  });
  console.log("\nDigiStorage round trip OK.");
}

void main();
