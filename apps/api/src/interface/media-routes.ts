import type { FastifyInstance } from "fastify";
import type { MediaUrlSigner } from "../infrastructure/storage/media-url-signer";
import { StorageObjectNotFoundError, type StorageProvider } from "../shared-kernel/storage-provider";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export interface MediaRouteDependencies {
  signer: MediaUrlSigner;
  provider: StorageProvider;
}

/**
 * The read path for backends with no presigned URLs. The signed token *is* the
 * authorisation (this prefix is public in `auth.ts`), so browsers can load a
 * preview in a plain <img>; the token names one key and expires.
 */
export function registerMediaRoutes(app: FastifyInstance, deps: MediaRouteDependencies): void {
  // A wildcard, not `:token`: Fastify caps a named parameter at 100 characters by
  // default (`maxParamLength`), and a signed token is roughly double that — a
  // named parameter answers every preview request with 414. A wildcard is not
  // subject to the cap, so this route works under whatever app options mount it.
  app.get("/media/*", async (request, reply) => {
    const token = (request.params as { "*": string })["*"];
    const granted = deps.signer.inspect(token);
    if (!granted) return reply.code(403).send({ code: "FORBIDDEN", message: "This link is invalid or has expired." });
    const { key, secondsLeft } = granted;

    try {
      const stream = await deps.provider.openRead(key);
      const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
      return (
        reply
          .header("Content-Type", CONTENT_TYPES[extension] ?? "application/octet-stream")
          // The same link comes back for a whole window, so the browser may reuse the image while
          // the link is valid, for an hour at most: a replaced photo keeps its key, so it must not
          // be cached for long, and is never `immutable`.
          .header("Cache-Control", `private, max-age=${Math.min(secondsLeft, 60 * 60)}`)
          .send(stream)
      );
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Resource not found." });
      }
      throw error;
    }
  });
}
