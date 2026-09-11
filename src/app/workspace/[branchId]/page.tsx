import { redirect } from "next/navigation";
import { requireBranch } from "@/features/tenancy/queries";

// The branch landing page was a menu of three links. The tabs do that now.
export default async function BranchPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const branch = await requireBranch(branchId);
  redirect(`/workspace/${branch.id}/service`);
}
