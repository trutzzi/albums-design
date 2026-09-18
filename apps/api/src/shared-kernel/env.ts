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
  /** Signs and verifies the per-person login JWT. `openssl rand -hex 32`. */
  JWT_SECRET: z.string().min(32),
  VISION_PROVIDER: z.enum(["heuristic", "anthropic", "ollama"]).default("heuristic"),
  OLLAMA_BASE_URL: z.string().min(1).default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5vl:7b"),
  // An empty string must mean the same as "not set" — Docker Compose's
  // `environment:` block always declares this key for the container (as ""
  // when the underlying value is blank, never truly absent), so `.optional()`
  // alone isn't enough: it only excuses a missing key, not a present-but-blank
  // one, and every operator who leaves this genuinely optional field blank
  // would otherwise crash the API on startup.
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
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
