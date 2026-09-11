"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export type AuthState = { error: string };
const credentialsSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256) });

export async function signIn(_previous: AuthState, form: FormData): Promise<AuthState> {
  if (!getSupabaseConfig()) return { error: "Staff sign-in is not connected yet. Please contact the restaurant owner." };
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email address and password." };
  try {
    const supabase = await createSupabaseServerClient({ writable: true });
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: error.status === 429 ? "Too many attempts. Please wait before trying again." : "We couldn’t sign you in. Check your details and try again." };
  } catch {
    return { error: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
  // Fixed destination prevents user-controlled open redirects. Keep outside catch.
  redirect("/workspace");
}

export async function signOut(_previous: AuthState, _form: FormData): Promise<AuthState> {
  if (getSupabaseConfig()) {
    try {
      const supabase = await createSupabaseServerClient({ writable: true });
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) return { error: "Sign-out failed. Please try again." };
    } catch {
      return { error: "Sign-out is temporarily unavailable. Please try again." };
    }
  }
  redirect("/login");
}
