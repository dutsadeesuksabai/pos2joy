import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const config = getSupabaseConfig();
  if (!config) return response;

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: values => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store");
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  // Refresh and verify remotely. Authorization remains in each data-access call.
  // Do not use the unverified user returned by getSession() for access checks.
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ["/login", "/workspace/:path*"] };
