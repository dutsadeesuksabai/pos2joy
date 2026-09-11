import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { requireBranch } from "@/features/tenancy/queries";
import { hasPermission, type Permission } from "@/features/tenancy/permissions";

const capabilities: { name: string; permission: Permission }[] = [
  { name: "Edit floor layouts", permission: "floor:edit" },
  { name: "Manage the waiting list", permission: "queue:manage" },
  { name: "Serve guest orders", permission: "orders:serve" },
  { name: "Manage the kitchen", permission: "kitchen:manage" },
  { name: "Handle bills", permission: "billing:manage" },
  { name: "Manage the team", permission: "team:manage" },
];

export default async function BranchPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const branch = await requireBranch(branchId);
  return <>
    <Link href="/workspace" className="auth-demo-link">← All your restaurants</Link>
    <div className="eyebrow">{branch.restaurantName}</div><h1>{branch.name}</h1>
    <p className="staff-description">{branch.timezone} · {branch.currency}</p>
    <Link className="floor-entry-link" href={`/workspace/${branch.id}/service`}><div><strong>Open service.</strong><span>Seat guests, take the queue, open and close bills, show table QR codes.</span></div><ArrowRight/></Link>
    {hasPermission(branch.role, "kitchen:manage") && <Link className="floor-entry-link" href={`/workspace/${branch.id}/kitchen`}><div><strong>Kitchen board.</strong><span>Every ticket still cooking, oldest first, with how long it has waited.</span></div><ArrowRight/></Link>}
    <Link className="floor-entry-link" href={`/workspace/${branch.id}/floor`}><div><strong>Your floor, your flow.</strong><span>{hasPermission(branch.role, "floor:edit") ? "Arrange tables, save drafts, and publish your dining room." : "View the published floor and table details."}</span></div><ArrowRight/></Link>
    <section className="access-card"><ShieldCheck/><div><h2>You’re signed in as {branch.role}.</h2><p>Your role includes these permissions:</p><ul>{capabilities.filter(item => hasPermission(branch.role, item.permission)).map(item => <li key={item.permission}><Check size={17}/>{item.name}</li>)}</ul></div></section>
    <section className="setup-note"><h2>More service tools are on the way.</h2><p>The floor planner saves to your restaurant. Live queue seating, QR ordering, and the kitchen workflow are the next integration stage.</p><Link className="auth-demo-link" href="/">Explore ordering and queue workflows with sample data →</Link></section>
  </>;
}
