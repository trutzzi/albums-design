import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit is its own binary, so it can't take the --env-file flag the tsx scripts use.
// Variables already set in the shell still win over the file.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set to run drizzle-kit (see .env.example).");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
