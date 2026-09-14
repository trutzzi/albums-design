import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDatabase(connectionString: string): { db: Database; close: () => Promise<void> } {
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}
