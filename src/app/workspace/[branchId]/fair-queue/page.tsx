import Link from "next/link";
import { requireBranch } from "@/features/tenancy/queries";
import { readService } from "@/features/service/repository";
import { FairQueue } from "@/features/queue/fair-queue";

export const dynamic = "force-dynamic";
export default async function FairQueuePage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const branch = await requireBranch(branchId, "queue:manage");
  const snapshot = await readService({ branchId: branch.id, organizationId: branch.organizationId });
  return <><Link href={`/workspace/${branch.id}/service`} className="auth-demo-link">← Back to service</Link><div className="eyebrow">{branch.restaurantName} · {branch.name}</div><h1>Fair Queue</h1><p className="staff-description">Match waiting parties to the room, with a reason for every choice.</p><FairQueue branchId={branch.id} snapshot={snapshot}/></>;
}
