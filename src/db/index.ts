import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let database: ReturnType<typeof connect> | undefined;
function connect(url: string) { return drizzle(postgres(url, { prepare: false, max: 5 }), { schema }); }
// Call only from an authorized server data-access layer. Privileged connections
// may bypass RLS. Staff routes authorize through features/tenancy/queries.ts;
// the public in-memory demo intentionally never connects to this helper.
export function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return database ??= connect(url);
}
