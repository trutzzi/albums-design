export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends ApplicationError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was not found.`, "NOT_FOUND");
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}

/**
 * Fastify raises typed 4xx failures of its own — payload too large, unsupported
 * media type — and collapsing those into a 500 hides the only detail the caller
 * can act on. The error reaches a handler as `unknown`, so read it defensively.
 */
export function clientErrorFrom(
  error: unknown,
): { status: number; code: string; message: string } | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { statusCode?: unknown; code?: unknown; message?: unknown };
  const status = typeof candidate.statusCode === "number" ? candidate.statusCode : undefined;
  if (status === undefined || status < 400 || status >= 500) return undefined;
  return {
    status,
    code: typeof candidate.code === "string" ? candidate.code : "BAD_REQUEST",
    message: typeof candidate.message === "string" ? candidate.message : "Request rejected.",
  };
}
