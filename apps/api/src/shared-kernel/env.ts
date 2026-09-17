import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_PUBLIC_ENDPOINT: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  VISION_PROVIDER: z.enum(["heuristic", "anthropic"]).default("heuristic"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

/**
 * Tools that only talk to the database — migrations, seeding — validate just this.
 * Demanding S3 credentials and a Redis URL before creating a table would block the
 * ordinary deploy shape where migrations run as their own step, with access to the
 * database and deliberately nothing else.
 */
const databaseEnvSchema = envSchema.pick({ DATABASE_URL: true });

export type Env = z.infer<typeof envSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseOrThrow(envSchema, source);
}

export function loadDatabaseEnv(source: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  return parseOrThrow(databaseEnvSchema, source);
}

function parseOrThrow<Schema extends z.ZodTypeAny>(
  schema: Schema,
  source: NodeJS.ProcessEnv,
): z.infer<Schema> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
