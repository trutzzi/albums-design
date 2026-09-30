import { once } from "node:events";
import type { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { ZipArchive } from "archiver";

/**
 * How much finished ZIP may wait in memory for a slow client before the next photo is
 * read. The archive's "entry" event fires once a file is in its own buffer, not once the
 * client has it — without this wait, a download over a slow link pulled the whole shoot
 * into memory (gigabytes) while the client was still on the first few photos.
 */
export const MAX_BUFFERED_BYTES = 16 * 1024 * 1024;

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

  let appended = 0;
  try {
    for (const entry of entries) {
      if (isAborted() || failure) break;
      const data = await entry.read();
      await new Promise<void>((resolve, reject) => {
        archive.once("entry", () => resolve());
        archive.once("error", reject);
        archive.append(data, { name: entry.name });
      });
      appended += data.length;
      await waitForClient(() => appended - archive.pointer() + output.writableLength, output, isAborted);
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

/**
 * Returns once what is queued for the client is small again: bytes handed to the archive
 * that it has not sent yet (it buffers them internally), plus what sits in the socket.
 */
async function waitForClient(queued: () => number, output: Writable, isAborted: () => boolean): Promise<void> {
  while (queued() > MAX_BUFFERED_BYTES && !isAborted() && !output.destroyed) {
    // A drain means the client took some; the short timer catches progress made without one.
    const waiting = new AbortController();
    const { signal } = waiting;
    await Promise.race([
      once(output, "drain", { signal }),
      once(output, "close", { signal }),
      delay(100, undefined, { signal }),
    ]).catch(() => undefined);
    waiting.abort();
  }
}
