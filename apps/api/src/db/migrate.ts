import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadEnv } from "../shared-kernel/env";
import { createDatabase } from "./client";

async function main() {
  const env = loadEnv();
  const { db, close } = createDatabase(env.DATABASE_URL);
  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await close();
  console.log("Migrations complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
