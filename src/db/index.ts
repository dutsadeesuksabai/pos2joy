import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = ReturnType<typeof connect>;
const processState = globalThis as typeof globalThis & { restaurantDatabase?: Database };
function connect(url: string) {
  // Bound connections per process; retain the pool across development reloads.
  // prepare:false supports Supabase's transaction pooler.
  return drizzle(postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10, max_lifetime: 60 * 30 }), { schema });
}
// Call only from an authorized server data-access layer. Privileged connections
// may bypass RLS. Staff routes authorize through features/tenancy/queries.ts;
// the public in-memory demo intentionally never connects to this helper.
export function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return processState.restaurantDatabase ??= connect(url);
}
