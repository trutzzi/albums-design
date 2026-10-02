import type { FastifyReply } from "fastify";
import { type ApplicationError, NotFoundError, TooManyAttemptsError } from "../shared-kernel/errors";

/**
 * The HTTP status for every application error code, in one table. Anything not listed is
 * a business rule the request broke (422). Every route answers through here, so a code
 * means the same status wherever it comes from.
 */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  PASSWORD_REQUIRED: 401,
  INVALID_PASSWORD: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  TOO_MANY_ATTEMPTS: 429,
  // The job queue is down: not the client's mistake, and worth retrying shortly.
  RETRY_NOT_QUEUED: 503,
};

export function httpStatusFor(error: ApplicationError): number {
  if (error instanceof NotFoundError) return 404;
  return STATUS_BY_CODE[error.code] ?? 422;
}

/**
 * Answers a failed `Result` from a use case. Logged at info with the code only: the
 * message can carry an email address, and a rejected request is the client's mistake,
 * not an incident.
 */
export function sendApplicationError(reply: FastifyReply, error: ApplicationError) {
  const status = httpStatusFor(error);
  if (error instanceof TooManyAttemptsError) reply.header("Retry-After", String(error.retryAfterSeconds));
  reply.log.info({ code: error.code, statusCode: status }, "request rejected");
  return reply.code(status).send({ code: error.code, message: error.message });
}
