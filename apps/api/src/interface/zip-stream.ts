import type { Writable } from "node:stream";
import { ZipArchive } from "archiver";

export interface ZipEntry {
  name: string;
  read(): Promise<Buffer>;
}

/**
 * Streams the entries into `output` as one ZIP, one file at a time. Photos are
 * already compressed, so the archive only stores them (no CPU spent shrinking
 * JPEGs by 1%), and only one original is in memory at once — a 2,000-photo shoot
 * is streamed, never assembled.
 *
 * Resolves `true` only when every entry was written and the archive finalised,
 * so a caller can tell a finished delivery from a dropped connection.
 */
export async function streamZip(
  output: Writable,
  entries: ZipEntry[],
  isAborted: () => boolean,
): Promise<boolean> {
  const archive = new ZipArchive({ store: true });
  let failure: Error | undefined;
  archive.on("error", (error: Error) => {
    failure = error;
  });
  archive.on("warning", (error: Error) => {
    failure = error;
  });
  archive.pipe(output);

  const finished = new Promise<void>((resolve, reject) => {
    output.once("finish", resolve);
    output.once("close", resolve);
    output.once("error", reject);
    archive.once("error", reject);
  });

  try {
    for (const entry of entries) {
      if (isAborted() || failure) break;
      const data = await entry.read();
      await new Promise<void>((resolve, reject) => {
        archive.once("entry", () => resolve());
        archive.once("error", reject);
        archive.append(data, { name: entry.name });
      });
    }
    if (isAborted() || failure) {
      archive.abort();
      return false;
    }
    await archive.finalize();
    await finished;
    return !isAborted() && !failure;
  } catch {
    archive.abort();
    return false;
  }
}
