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
  // Refresh cookies and verify the JWT. Asymmetric projects can use cached JWKS
  // here; the data-access layer still calls getUser for current user state and
  // checks branch membership in Postgres. Never trust getSession().user.
  await supabase.auth.getClaims();
  return response;
}

export const config = { matcher: ["/login", "/workspace/:path*"] };
