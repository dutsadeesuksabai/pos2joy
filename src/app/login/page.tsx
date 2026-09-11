import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getVerifiedUser } from "@/features/tenancy/session";
import { SignInForm } from "@/features/tenancy/auth-forms";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await getVerifiedUser()) redirect("/workspace");
  const configured = Boolean(getSupabaseConfig());
  return <main className="auth-page"><section className="auth-story"><Link href="/" className="brand">POS 2 <span>joy</span> ✳</Link><div><Sparkles size={42}/><h1>Good service<br/>starts with you.</h1><p>One place for your people, your tables, and all the little moments in between.</p></div><span>A LITTLE MORE JOY IN EVERY SERVICE</span></section><section className="auth-card"><div className="eyebrow">WELCOME BACK</div><h2>Your next great<br/>service starts here.</h2>{configured ? <SignInForm/> : <div className="setup-note"><h3>Staff sign-in is coming soon.</h3><p>This installation hasn’t been connected to a restaurant account yet. You can explore the floor planner and guest menu in the demo.</p></div>}<Link className="auth-demo-link" href="/">Explore the interactive demo →</Link></section></main>;
}
