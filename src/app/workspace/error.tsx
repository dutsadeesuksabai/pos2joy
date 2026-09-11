"use client";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <section className="setup-note" role="alert"><h2>We couldn’t load your restaurant.</h2><p>Please try again. If this continues, ask your administrator to check the database connection and setup.</p><Button onClick={reset}>Try again</Button></section>;
}
