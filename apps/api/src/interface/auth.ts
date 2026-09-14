import type { FastifyInstance, FastifyRequest } from "fastify";
import { hashApiKey } from "../modules/identity/domain/studio";
import type { StudioRepository } from "../modules/identity/domain/repositories";
import "./request-context";

/**
 * Anything not listed here needs a studio key. The list is exact-match or an
 * explicit prefix — `/studios` must never be a blanket prefix, or every
 * studio-scoped route (uploads, billing, members) would be public.
 */
const PUBLIC_EXACT = ["/health", "/plans", "/layout-templates", "/print-profiles"];
const PUBLIC_PREFIXES = ["/review/"];

export interface StudioAuthOptions {
  /**
   * Extra unauthenticated prefixes. Demo mode uses this to expose its stand-in
   * blob routes, which browsers reach by presigned URL and so send no key —
   * exactly as they would with real S3. Production passes nothing.
   */
  publicPrefixes?: string[];
}

function isPublic(request: FastifyRequest, extraPrefixes: string[]): boolean {
  const path = request.url.split("?")[0] ?? "";
  // Onboarding creates the very first studio, so it cannot require a key.
  if (request.method === "POST" && path === "/studios") return true;
  if (PUBLIC_EXACT.includes(path)) return true;
  return [...PUBLIC_PREFIXES, ...extraPrefixes].some((prefix) => path.startsWith(prefix));
}

/**
 * A studio-scoped API key is enough for the MVP and keeps the whole product runnable
 * with no third-party identity provider. Swapping in Clerk means replacing this hook.
 */
export function registerStudioAuth(
  app: FastifyInstance,
  studios: StudioRepository,
  options: StudioAuthOptions = {},
): void {
  const extraPrefixes = options.publicPrefixes ?? [];
  app.addHook("onRequest", async (request, reply) => {
    if (isPublic(request, extraPrefixes)) return;

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "Missing studio API key." });
    }

    const studio = await studios.findByApiKeyHash(hashApiKey(header.slice("Bearer ".length).trim()));
    if (!studio) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "Invalid studio API key." });
    }

    request.studioId = studio.id.toString();
  });
}
