import type { FastifyInstance } from "fastify";

/**
 * Fastify rejects `Content-Type: application/json` with an empty body before a
 * route ever runs, which turns a bodyless POST — resolving a comment, say — into an
 * opaque FST_ERR_CTP_EMPTY_JSON_BODY. Treating empty as `{}` lets the route's own
 * schema answer instead, so a caller gets a real validation message or a 200.
 */
export function acceptEmptyJsonBody(app: FastifyInstance): void {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body: string, done) => {
      if (body === undefined || body === null || body.trim() === "") {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch (error) {
        const failure = error as Error & { statusCode?: number };
        failure.statusCode = 400;
        done(failure, undefined);
      }
    },
  );
}
