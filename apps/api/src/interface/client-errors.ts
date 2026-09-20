import type { FastifyReply } from "fastify";
import { ApplicationError, NotFoundError, TooManyAttemptsError } from "../shared-kernel/errors";

/** The status codes for everything a client-facing link can answer, in one place. */
export function sendClientError(reply: FastifyReply, error: ApplicationError) {
  if (error instanceof TooManyAttemptsError) reply.header("Retry-After", String(error.retryAfterSeconds));
  const status =
    error instanceof NotFoundError
      ? 404
      : error.code === "CONFLICT"
        ? 409
        : error.code === "PASSWORD_REQUIRED" || error.code === "INVALID_PASSWORD"
          ? 401
          : error.code === "TOO_MANY_ATTEMPTS"
            ? 429
            : 422;
  return reply.code(status).send({ code: error.code, message: error.message });
}

/** The proof of an entered password: a header for API calls, a query value for plain download links. */
export function grantFrom(request: { headers: Record<string, unknown>; query?: unknown }): string | undefined {
  const header = request.headers["x-access-grant"];
  if (typeof header === "string" && header) return header;
  const query = (request.query ?? {}) as { grant?: unknown };
  return typeof query.grant === "string" && query.grant ? query.grant : undefined;
}
