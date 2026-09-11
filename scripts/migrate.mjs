import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Explicit operator action only; no schema mutations during app startup.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for migrations");
let client;
try {
  client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Reviewed Drizzle migrations applied.");
} catch {
  console.error("Migration failed. Verify connectivity, permissions, and generated migration files. Database credentials are not logged.");
  process.exitCode = 1;
} finally {
  await client?.end();
}
