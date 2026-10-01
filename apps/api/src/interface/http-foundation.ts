import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { LogController, type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { Logger } from "../shared-kernel/logger";
import { acceptEmptyJsonBody } from "./empty-body";
import { registerErrorHandler } from "./error-handler";
import { registerRequestMetrics, type RequestMetrics } from "./request-metrics";

export const REQUEST_ID_HEADER = "x-request-id";

/** What an id a caller sends may look like; anything else (or nothing) gets a fresh UUID. */
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * A request keeps the id its caller (a proxy, the web app) gave it, so one id follows it
 * across services; a malformed one is replaced rather than written into the logs.
 */
export function requestIdFor(request: IncomingMessage): string {
  const incoming = request.headers[REQUEST_ID_HEADER];
  return typeof incoming === "string" && ACCEPTED_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/** The Fastify options every server built on this core shares. */
export function httpServerOptions(loggerInstance: FastifyBaseLogger | undefined) {
  return {
    ...(loggerInstance ? { loggerInstance } : { logger: false }),
    genReqId: requestIdFor,
    logController: new LogController({ requestIdLogLabel: "requestId" }),
  };
}

export interface HttpFoundationOptions {
  logger: Logger;
  metrics: RequestMetrics;
  exposeInternalErrors?: boolean;
}

/**
 * What every server needs before its routes: the request id echoed back, tolerant JSON
 * parsing, latency metrics and the error handler. Shared by the API and demo mode so the
 * two cannot drift apart again.
 */
export function registerHttpFoundation(app: FastifyInstance, options: HttpFoundationOptions): void {
  // onRequest, ahead of the auth hook, so even a 401 carries the id.
  app.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });
  acceptEmptyJsonBody(app);
  registerRequestMetrics(app, options.metrics);
  registerErrorHandler(app, {
    logger: options.logger,
    metrics: options.metrics,
    ...(options.exposeInternalErrors ? { exposeInternalErrors: true } : {}),
  });
}
