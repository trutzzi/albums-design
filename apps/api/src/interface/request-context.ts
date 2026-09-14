/**
 * The studio resolved from the API key, attached by the auth hook and read by the
 * tenancy guard and route handlers. Kept in its own module so every file that
 * touches `request.studioId` loads the augmentation, whichever entrypoint compiles it.
 */
declare module "fastify" {
  interface FastifyRequest {
    studioId?: string;
  }
}

export {};
