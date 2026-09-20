import type { FastifyInstance, FastifyRequest } from "fastify";
import { hashApiKey } from "../modules/identity/domain/studio";
import type { StudioRepository } from "../modules/identity/domain/repositories";
import { verifyJwt } from "../shared-kernel/jwt";
import "./request-context";

/**
 * Anything not listed here needs a studio key. The list is exact-match or an
 * explicit prefix — `/studios` must never be a blanket prefix, or every
 * studio-scoped route (uploads, billing, members) would be public.
 */
const PUBLIC_EXACT = ["/health", "/plans", "/layout-templates", "/print-profiles"];
const PUBLIC_PREFIXES = ["/review/", "/pick/", "/download/", "/media/"];

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
  // Signing up and logging in are how a request earns a credential — neither
  // can itself require one.
  if (request.method === "POST" && (path === "/auth/register" || path === "/auth/login")) {
    return true;
  }
  if (PUBLIC_EXACT.includes(path)) return true;
  return [...PUBLIC_PREFIXES, ...extraPrefixes].some((prefix) => path.startsWith(prefix));
}

/**
 * Accepts either credential a Bearer token can carry: a studio-wide API key
 * (the original MVP shape, still what the deployed demo frontend and any
 * server-to-server caller use), or a per-person JWT issued by login/register.
 * A JWT is tried first — it's a cheap local signature check — and only falls
 * back to the database lookup the API key needs when that fails, so the
 * common case (a logged-in user) never touches the studios table just to
 * authenticate.
 */
export function registerStudioAuth(
  app: FastifyInstance,
  studios: StudioRepository,
  jwtSecret: string,
  options: StudioAuthOptions = {},
): void {
  const extraPrefixes = options.publicPrefixes ?? [];
  app.addHook("onRequest", async (request, reply) => {
    if (isPublic(request, extraPrefixes)) return;

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "Missing credentials." });
    }
    const token = header.slice("Bearer ".length).trim();

    const payload = verifyJwt(token, jwtSecret);
    if (payload && typeof payload["studioId"] === "string") {
      request.studioId = payload["studioId"];
      request.memberId = payload.sub;
      if (typeof payload["role"] === "string") request.role = payload["role"];
      return;
    }

    const studio = await studios.findByApiKeyHash(hashApiKey(token));
    if (!studio) {
      return reply.code(401).send({ code: "UNAUTHORIZED", message: "Invalid credentials." });
    }

    request.studioId = studio.id.toString();
  });
}
