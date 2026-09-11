import { requireBranch } from "@/features/tenancy/queries";
import { readKitchen } from "@/features/service/repository";
import { KitchenBoard } from "@/features/service/kitchen";

export const dynamic = "force-dynamic";

export default async function KitchenPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const branch = await requireBranch(branchId, "kitchen:manage");
  const tickets = await readKitchen({ branchId: branch.id, organizationId: branch.organizationId });
  return <>
    <KitchenBoard branchId={branch.id} tickets={tickets}/>
  </>;
}
