import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadDatabaseEnv, loadEnv } from "../src/shared-kernel/env";

const DATABASE_ONLY = { DATABASE_URL: "postgres://user:pass@localhost:5432/albumflow" };

const FULL = {
  ...DATABASE_ONLY,
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "albumflow-photos",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  JWT_SECRET: "test-only-jwt-secret-at-least-32-characters-long",
};

describe("environment configuration", () => {
  it("lets a migration run with nothing but a database", () => {
    // Migrations run as their own deploy step, with database access and nothing
    // else. Requiring S3 credentials to create a table would block that shape.
    const env = loadDatabaseEnv(DATABASE_ONLY as NodeJS.ProcessEnv);
    assert.equal(env.DATABASE_URL, DATABASE_ONLY.DATABASE_URL);
  });

  it("still refuses a migration with no database at all", () => {
    assert.throws(
      () => loadDatabaseEnv({} as NodeJS.ProcessEnv),
      /DATABASE_URL/,
    );
  });

  it("holds the server to the full configuration", () => {
    // The API genuinely needs storage and a queue, so it must not start half-configured.
    assert.throws(() => loadEnv(DATABASE_ONLY as NodeJS.ProcessEnv), /S3_BUCKET/);
    const env = loadEnv(FULL as NodeJS.ProcessEnv);
    assert.equal(env.S3_BUCKET, "albumflow-photos");
    assert.equal(env.S3_REGION, "us-east-1", "a sensible default went missing");
    assert.equal(env.VISION_PROVIDER, "heuristic");
  });

  it("treats a blank ANTHROPIC_API_KEY the same as an absent one", () => {
    // Docker Compose's `environment:` block always declares this key for the
    // container — as "" when the underlying value is blank in a server's
    // .env, never truly absent. A real production crash: any operator who
    // leaves this genuinely optional field blank could not start the API.
    const env = loadEnv({ ...FULL, ANTHROPIC_API_KEY: "" } as NodeJS.ProcessEnv);
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
  });

  it("still accepts a real ANTHROPIC_API_KEY when one is configured", () => {
    const env = loadEnv({ ...FULL, ANTHROPIC_API_KEY: "sk-ant-real" } as NodeJS.ProcessEnv);
    assert.equal(env.ANTHROPIC_API_KEY, "sk-ant-real");
  });

  it("reports every missing variable at once, not just the first", () => {
    // A deploy should learn its whole configuration gap in one run.
    try {
      loadEnv(DATABASE_ONLY as NodeJS.ProcessEnv);
      assert.fail("expected the full schema to reject a database-only environment");
    } catch (error) {
      const message = (error as Error).message;
      for (const variable of ["REDIS_URL", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID"]) {
        assert.match(message, new RegExp(variable));
      }
    }
  });
});
