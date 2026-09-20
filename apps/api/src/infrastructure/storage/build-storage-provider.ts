import type { Env } from "../../shared-kernel/env";
import type { StorageProvider } from "../../shared-kernel/storage-provider";
import { DigiStorageProvider } from "./digistorage-storage-provider";
import { MediaUrlSigner } from "./media-url-signer";

export interface BuiltStorage {
  /** `undefined` when no long-term provider is configured — every caller treats that as "single-tier, as before". */
  provider: StorageProvider | undefined;
  signer: MediaUrlSigner;
}

/**
 * The one place that turns `STORAGE_PROVIDER` into an adapter. Adding Cloudflare
 * R2 or Backblaze B2 later means a new case here and a new class — nothing that
 * calls a `StorageProvider` changes.
 */
export function buildStorage(env: Env): BuiltStorage {
  const publicApiUrl = env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`;
  const signer = new MediaUrlSigner(env.JWT_SECRET, publicApiUrl);

  switch (env.STORAGE_PROVIDER) {
    case "digistorage": {
      const missing = [
        ["DIGISTORAGE_WEBDAV_URL", env.DIGISTORAGE_WEBDAV_URL],
        ["DIGISTORAGE_USERNAME", env.DIGISTORAGE_USERNAME],
        ["DIGISTORAGE_APP_PASSWORD", env.DIGISTORAGE_APP_PASSWORD],
        ["PUBLIC_API_URL", env.PUBLIC_API_URL],
      ]
        .filter(([, value]) => !value)
        .map(([name]) => name);
      if (missing.length > 0) {
        throw new Error(`STORAGE_PROVIDER=digistorage requires: ${missing.join(", ")}`);
      }
      return {
        signer,
        provider: new DigiStorageProvider({
          webdavUrl: env.DIGISTORAGE_WEBDAV_URL!,
          username: env.DIGISTORAGE_USERNAME!,
          appPassword: env.DIGISTORAGE_APP_PASSWORD!,
          rootPath: env.DIGISTORAGE_ROOT_PATH,
          urlSigner: signer,
        }),
      };
    }
    case "none":
    default:
      return { signer, provider: undefined };
  }
}
