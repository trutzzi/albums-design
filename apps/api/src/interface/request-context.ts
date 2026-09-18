/**
 * The studio resolved from the API key or JWT, attached by the auth hook and
 * read by the tenancy guard and route handlers. Kept in its own module so
 * every file that touches `request.studioId` loads the augmentation,
 * whichever entrypoint compiles it. `memberId`/`role` are only ever set for a
 * JWT-authenticated request — a shared studio API key carries no notion of
 * which person is calling.
 */
declare module "fastify" {
  interface FastifyRequest {
    studioId?: string;
    memberId?: string;
    role?: string;
  }
}

export {};
