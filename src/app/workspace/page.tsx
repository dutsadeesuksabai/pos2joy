import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { listAuthorizedBranches } from "@/features/tenancy/queries";
import { requireUser } from "@/features/tenancy/session";

export default async function BranchPickerPage() {
  await requireUser();
  if (!process.env.DATABASE_URL) return <section className="setup-note"><h1>Your account is ready.</h1><p>The restaurant database still needs to be connected by the installation administrator.</p></section>;
  const branches = await listAuthorizedBranches();
  return <><div className="eyebrow">YOUR RESTAURANTS</div><h1>Where are we serving today?</h1><p className="staff-description">Choose a branch to open your workspace.</p>{branches.length ? <div className="branch-grid">{branches.map(branch => <Link className="branch-card" href={`/workspace/${branch.id}`} key={branch.id}><Store/><span className="role-label">{branch.role}</span><h2>{branch.restaurantName}</h2><p>{branch.name}</p><div><span>{branch.timezone} · {branch.currency}</span><ArrowRight size={20}/></div></Link>)}</div> : <section className="setup-note"><h2>No restaurants assigned yet.</h2><p>Ask your restaurant owner to add your account to a branch. You’ll see it here once access is assigned.</p></section>}</>;
}
