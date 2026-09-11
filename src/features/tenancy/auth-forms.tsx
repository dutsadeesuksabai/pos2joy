"use client";

import { useActionState } from "react";
import { ArrowRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signIn, signOut } from "./actions";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, { error: "" });
  return <form action={action} className="auth-form">
    <label htmlFor="identifier">Username</label>
    <input id="identifier" name="identifier" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={254} placeholder="e.g. owner" aria-describedby={state.error ? "auth-error" : undefined}/>
    <label htmlFor="password">Password</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} aria-describedby={state.error ? "auth-error" : undefined}/>
    {state.error && <p id="auth-error" className="auth-error" role="alert">{state.error}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in to your restaurant"}<ArrowRight/></Button>
    <p className="auth-help">Use the individual staff account your restaurant owner provided. A work email address works here too.</p>
  </form>;
}

export function SignOutForm() {
  const [state, action, pending] = useActionState(signOut, { error: "" });
  return <form action={action}><Button type="submit" variant="outline" disabled={pending}><LogOut/>{pending ? "Signing out…" : "Sign out"}</Button>{state.error && <p className="auth-error" role="alert">{state.error}</p>}</form>;
}
