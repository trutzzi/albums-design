import type { Readable } from "node:stream";
import { createClient, type FileStat, type WebDAVClient } from "webdav";
import {
  StorageObjectNotFoundError,
  assertSafeKey,
  normalizePrefix,
  type StorageProvider,
  type StoredObjectInfo,
} from "../../shared-kernel/storage-provider";
import type { MediaUrlSigner } from "./media-url-signer";

export interface DigiStorageConfig {
  /** The WebDAV endpoint shown in DigiStorage's account settings. */
  webdavUrl: string;
  /** The account's login name (an email address) — read from the environment, never committed. */
  username: string;
  /** A dedicated DigiStorage *app password*, not the main account password. */
  appPassword: string;
  /** Folder under the WebDAV root that holds everything AlbumFlow writes. */
  rootPath: string;
  urlSigner: MediaUrlSigner;
  /** Per-request ceilings; a hung connection must fail the job so BullMQ can retry it. */
  uploadTimeoutMs?: number;
  requestTimeoutMs?: number;
}

const PART_SUFFIX = ".part";

/**
 * DigiStorage speaks WebDAV, which has no presigned URLs — so this adapter
 * never hands out a backend URL. `getUrl` returns a signed link to this API's
 * `/media/` route, which streams the object back out through `openRead`.
 *
 * Uploads land in a `.part` sibling and are MOVEd into place, because WebDAV
 * PUT is not atomic: a crash mid-transfer would otherwise leave a truncated
 * file at the final key, and `head()` reporting it would make a retry skip the
 * re-upload — permanently keeping a corrupt copy of someone's wedding photo.
 */
export class DigiStorageProvider implements StorageProvider {
  readonly id = "digistorage";

  private readonly client: WebDAVClient;
  private readonly root: string;
  private readonly urlSigner: MediaUrlSigner;
  private readonly uploadTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly knownDirectories = new Set<string>();

  constructor(config: DigiStorageConfig) {
    this.client = createClient(config.webdavUrl, {
      username: config.username,
      password: config.appPassword,
    });
    this.root = normalizePrefix(config.rootPath);
    this.urlSigner = config.urlSigner;
    this.uploadTimeoutMs = config.uploadTimeoutMs ?? 120_000;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 20_000;
  }

  async upload(key: string, body: Buffer, _options: { contentType: string }): Promise<void> {
    const finalPath = this.pathFor(key);
    const partPath = `${finalPath}${PART_SUFFIX}`;
    const directory = parentOf(finalPath);
    await this.ensureDirectory(directory);

    const put = () =>
      this.client.putFileContents(partPath, body, {
        overwrite: true,
        contentLength: body.byteLength,
        signal: AbortSignal.timeout(this.uploadTimeoutMs),
      });
    try {
      await put();
    } catch (error) {
      // 409 means the parent folder is gone — another process (the worker's
      // purge, a project delete) removed it after this one cached it as existing.
      if (!hasStatus(error, 409)) throw error;
      this.knownDirectories.delete(directory);
      await this.ensureDirectory(directory);
      await put();
    }
    await this.client.moveFile(partPath, finalPath, {
      overwrite: true,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
  }

  async openRead(key: string): Promise<Readable> {
    const path = this.pathFor(key);
    // Stat first so a missing object is an error *before* the caller has sent
    // response headers — a stream that fails later can only truncate a 200.
    if (!(await this.head(key))) throw new StorageObjectNotFoundError(key);
    return this.client.createReadStream(path, {
      signal: AbortSignal.timeout(this.uploadTimeoutMs),
    }) as Readable;
  }

  async head(key: string): Promise<StoredObjectInfo | undefined> {
    try {
      const stat = (await this.client.stat(this.pathFor(key), {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      })) as FileStat;
      if (stat.type !== "file") return undefined;
      return this.toInfo(stat);
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async list(prefix: string): Promise<StoredObjectInfo[]> {
    // Depth-1 walk rather than `deep: true`: many WebDAV servers refuse
    // `Depth: infinity`, and a project has only a couple of folder levels.
    const found: StoredObjectInfo[] = [];
    const pending = [this.pathFor(normalizePrefix(prefix))];
    while (pending.length > 0) {
      const directory = pending.pop()!;
      let entries: FileStat[];
      try {
        entries = (await this.client.getDirectoryContents(directory, {
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        })) as FileStat[];
      } catch (error) {
        if (isNotFound(error)) continue;
        throw error;
      }
      for (const entry of entries) {
        if (entry.type === "directory") pending.push(this.normalizeRemote(entry.filename));
        else if (!entry.filename.endsWith(PART_SUFFIX)) found.push(this.toInfo(entry));
      }
    }
    return found.sort((a, b) => a.key.localeCompare(b.key));
  }

  async delete(key: string): Promise<void> {
    await this.deleteRemote(this.pathFor(key));
  }

  async deletePrefix(prefix: string): Promise<void> {
    const path = this.pathFor(normalizePrefix(prefix));
    await this.deleteRemote(path);
    for (const known of this.knownDirectories) {
      if (known === path || known.startsWith(`${path}/`)) this.knownDirectories.delete(known);
    }
  }

  async getUrl(key: string, options: { expiresInSeconds: number }): Promise<string> {
    assertSafeKey(key);
    return this.urlSigner.sign(key, options.expiresInSeconds);
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    return `/${this.root}/${key}`;
  }

  private toInfo(stat: FileStat): StoredObjectInfo {
    const remote = this.normalizeRemote(stat.filename);
    const rootPrefix = `/${this.root}/`;
    return {
      key: remote.startsWith(rootPrefix) ? remote.slice(rootPrefix.length) : remote,
      size: stat.size,
      lastModified: stat.lastmod ? new Date(stat.lastmod) : undefined,
    };
  }

  /** Servers report paths with or without a trailing slash and with URL-encoding; make them comparable. */
  private normalizeRemote(filename: string): string {
    let path = filename;
    try {
      path = decodeURIComponent(filename);
    } catch {
      // Already a plain path.
    }
    if (!path.startsWith("/")) path = `/${path}`;
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  }

  private async deleteRemote(path: string): Promise<void> {
    try {
      await this.client.deleteFile(path, { signal: AbortSignal.timeout(this.requestTimeoutMs) });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  private async ensureDirectory(path: string): Promise<void> {
    if (this.knownDirectories.has(path)) return;
    await this.client.createDirectory(path, {
      recursive: true,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    this.knownDirectories.add(path);
  }
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === status
  );
}

function isNotFound(error: unknown): boolean {
  return hasStatus(error, 404);
}
