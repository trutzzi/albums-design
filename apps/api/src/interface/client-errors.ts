/** The proof of an entered password: a header for API calls, a query value for plain download links. */
export function grantFrom(request: { headers: Record<string, unknown>; query?: unknown }): string | undefined {
  const header = request.headers["x-access-grant"];
  if (typeof header === "string" && header) return header;
  const query = (request.query ?? {}) as { grant?: unknown };
  return typeof query.grant === "string" && query.grant ? query.grant : undefined;
}
