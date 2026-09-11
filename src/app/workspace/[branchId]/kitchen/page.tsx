import { cookies } from "next/headers";
import { resolveLocale } from "@/i18n/dictionary";
import { requireBranch } from "@/features/tenancy/queries";
import { readKitchen } from "@/features/service/repository";
import { KitchenBoard } from "@/features/service/kitchen";

export const dynamic = "force-dynamic";

export default async function KitchenPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const locale = resolveLocale((await cookies()).get("lang")?.value);
  const branch = await requireBranch(branchId, "kitchen:manage");
  const tickets = await readKitchen({ branchId: branch.id, organizationId: branch.organizationId });
  return <>
    <KitchenBoard branchId={branch.id} tickets={tickets} locale={locale}/>
  </>;
}
