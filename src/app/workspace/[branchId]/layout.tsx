import { requireBranch } from "@/features/tenancy/queries";
import { hasPermission } from "@/features/tenancy/permissions";
import { cookies, headers } from "next/headers";
import { resolveLocale, translate } from "@/i18n/dictionary";
import { BranchTabs } from "./tabs";

export default async function BranchLayout({ children, params }: { children: React.ReactNode; params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const branch = await requireBranch(branchId);
  const locale = resolveLocale((await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
  const tabs = [
    { href: "/service", label: translate(locale, "staff.service") },
    ...(hasPermission(branch.role, "kitchen:manage") ? [{ href: "/kitchen", label: translate(locale, "staff.kitchen") }] : []),
    { href: "/floor", label: translate(locale, "staff.floor") },
  ];
  return <>
    <div className="branch-bar"><strong>{branch.name}</strong><span>{branch.restaurantName}</span></div>
    <BranchTabs branchId={branch.id} tabs={tabs}/>
    {children}
  </>;
}
