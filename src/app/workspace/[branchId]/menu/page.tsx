import { cookies } from "next/headers";
import { resolveLocale } from "@/i18n/dictionary";
import { requireBranch } from "@/features/tenancy/queries";
import { listSisterBranches, readMenu } from "@/features/menu/repository";
import { MenuEditor } from "@/features/menu/editor";

export const dynamic = "force-dynamic";

export default async function MenuPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const locale = resolveLocale((await cookies()).get("lang")?.value);
  const branch = await requireBranch(branchId, "menu:manage");
  const scope = { branchId: branch.id, organizationId: branch.organizationId };
  const [items, sisters] = await Promise.all([readMenu(scope), listSisterBranches(scope)]);
  return <MenuEditor branchId={branch.id} currency={branch.currency} items={items} sisters={sisters} locale={locale}/>;
}
