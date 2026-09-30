import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { StorageProvider } from "../../shared-kernel/storage-provider";

const REMOTE_PREFIX = "backups/database";
/** Only finished dumps: the backup script writes under a dot-prefixed name and renames when done. */
const DUMP_NAME = /^albumflow-[0-9TZ:-]+\.dump$/;

export interface OffsiteBackupSummary {
  uploaded: string[];
  alreadyThere: number;
  pruned: number;
}

/**
 * Copies the nightly Postgres dumps off the server, onto the same long-term storage
 * that already holds the photo originals. A dump that only lives on the VPS is gone
 * with the VPS; this is what makes a lost server a restore instead of a loss.
 *
 * Idempotent: a dump already stored at the same size is skipped, so running it
 * again (or twice at once) only repeats cheap `head` calls.
 */
export class OffsiteDatabaseBackups {
  constructor(
    private readonly provider: StorageProvider,
    private readonly directory: string,
    /** How many dumps to keep off-site; older ones are deleted. */
    private readonly keep: number,
  ) {}

  async run(): Promise<OffsiteBackupSummary> {
    const local = (await readdir(this.directory)).filter((name) => DUMP_NAME.test(name)).sort();
    const summary: OffsiteBackupSummary = { uploaded: [], alreadyThere: 0, pruned: 0 };

    for (const name of local) {
      const path = join(this.directory, name);
      const { size } = await stat(path);
      const remote = await this.provider.head(`${REMOTE_PREFIX}/${name}`);
      if (remote?.size === size) {
        summary.alreadyThere += 1;
        continue;
      }
      await this.provider.upload(`${REMOTE_PREFIX}/${name}`, await readFile(path), {
        contentType: "application/octet-stream",
      });
      summary.uploaded.push(name);
    }

    // Names sort by their timestamp, so everything before the newest `keep` is older.
    const remote = (await this.provider.list(REMOTE_PREFIX))
      .map((object) => object.key)
      .filter((key) => DUMP_NAME.test(key.split("/").pop() ?? ""))
      .sort();
    for (const key of remote.slice(0, Math.max(0, remote.length - this.keep))) {
      await this.provider.delete(key);
      summary.pruned += 1;
    }

    return summary;
  }
}
