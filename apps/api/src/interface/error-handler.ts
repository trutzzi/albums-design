import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { clientErrorFrom } from "../shared-kernel/errors";
import type { Logger } from "../shared-kernel/logger";
import { redactUrl } from "../infrastructure/logging/pino-logger";
import type { RequestMetrics } from "./request-metrics";

export interface ErrorHandlerOptions {
  logger: Logger;
  metrics: RequestMetrics;
  /** Demo mode shows the real failure in the browser; production never sends internals to a client. */
  exposeInternalErrors?: boolean;
}

/**
 * The one place an exception thrown by a route turns into a response. A client mistake
 * (invalid input, a Fastify 4xx) is answered as such and logged at info; anything else
 * is a server fault — logged with its stack, reported to Sentry by the logger, counted on
 * the admin dashboard, and answered with the request id so a report can be traced.
 */
export function registerErrorHandler(app: FastifyInstance, options: ErrorHandlerOptions): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      // Paths and issue codes only: a message can echo back what the client sent.
      request.log.info(
        { code: "BAD_REQUEST", issues: error.issues.map((issue) => `${issue.path.join(".") || "(body)"}: ${issue.code}`) },
        "request validation failed",
      );
      return reply
        .code(400)
        .send({ code: "BAD_REQUEST", message: error.issues.map((i) => i.message).join(", ") });
    }

    const clientError = clientErrorFrom(error);
    if (clientError) {
      request.log.info({ code: clientError.code, statusCode: clientError.status }, "request rejected");
      return reply
        .code(clientError.status)
        .send({ code: clientError.code, message: clientError.message });
    }

    const route = request.routeOptions.url ?? redactUrl(request.url);
    const message = error instanceof Error ? error.message : String(error);
    options.logger.error("request failed", { err: error, requestId: request.id, method: request.method, route });
    options.metrics.recordError({ at: new Date().toISOString(), method: request.method, route, message });
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: options.exposeInternalErrors ? message : "Something went wrong.",
      requestId: request.id,
    });
  });
}
