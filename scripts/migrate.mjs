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
} catch (wrapped) {
  // Drizzle wraps driver failures, so walk to the root cause. Report its code
  // and message; Postgres errors carry no credentials and the URL is never printed.
  let error = wrapped;
  while (error.cause && !error.code) error = error.cause;
  console.error(`Migration failed${error.code ? ` [${error.code}]` : ""}: ${error.message}`);
  if (error.code === "28P01") console.error("The database password is wrong. Reset it under Project Settings > Database and percent-encode it in DATABASE_URL.");
  if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") console.error("The database host is unreachable. Check the host and port in DATABASE_URL.");
  process.exitCode = 1;
} finally {
  await client?.end();
}
