import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

// Server Components read refreshed cookies supplied by proxy.ts. Only actions
// and route handlers opt into writing; cookie errors there must not be swallowed.
export async function createSupabaseServerClient({ writable = false } = {}) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase environment is not configured");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: values => {
        if (!writable) return;
        for (const { name, value, options } of values) store.set(name, value, options);
      },
    },
  });
}
