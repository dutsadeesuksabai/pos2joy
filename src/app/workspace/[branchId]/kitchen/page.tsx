import Link from "next/link";
import { requireBranch } from "@/features/tenancy/queries";
import { readKitchen } from "@/features/service/repository";
import { KitchenBoard } from "@/features/service/kitchen";

export const dynamic = "force-dynamic";

export default async function KitchenPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const branch = await requireBranch(branchId, "kitchen:manage");
  const tickets = await readKitchen({ branchId: branch.id, organizationId: branch.organizationId });
  return <>
    <Link href={`/workspace/${branch.id}`} className="auth-demo-link">← {branch.restaurantName} · {branch.name}</Link>
    <div className="eyebrow">KITCHEN</div><h1>What’s cooking.</h1>
    <p className="staff-description">Oldest ticket first. The board refreshes itself every 15 seconds.</p>
    <KitchenBoard branchId={branch.id} tickets={tickets}/>
  </>;
}
