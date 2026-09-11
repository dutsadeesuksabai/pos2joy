import { requireBranch } from "@/features/tenancy/queries";
import { hasPermission } from "@/features/tenancy/permissions";
import { BranchTabs } from "./tabs";

export default async function BranchLayout({ children, params }: { children: React.ReactNode; params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const branch = await requireBranch(branchId);
  const tabs = [
    { href: "/service", label: "Service" },
    ...(hasPermission(branch.role, "kitchen:manage") ? [{ href: "/kitchen", label: "Kitchen" }] : []),
    { href: "/floor", label: "Floor" },
  ];
  return <>
    <div className="branch-bar"><strong>{branch.name}</strong><span>{branch.restaurantName}</span></div>
    <BranchTabs branchId={branch.id} tabs={tabs}/>
    {children}
  </>;
}
