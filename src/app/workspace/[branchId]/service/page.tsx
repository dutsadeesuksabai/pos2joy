import Link from "next/link";
import { cookies, headers } from "next/headers";

import { resolveLocale } from "@/i18n/dictionary";
import { requireBranch } from "@/features/tenancy/queries";
import { hasPermission } from "@/features/tenancy/permissions";
import { readInsights, readService } from "@/features/service/repository";
import { ServiceConsole } from "@/features/service/console";

export const dynamic = "force-dynamic";

export default async function ServicePage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const locale = resolveLocale((await cookies()).get("lang")?.value);
  const branch = await requireBranch(branchId);
  const scope = { branchId: branch.id, organizationId: branch.organizationId };
  const [snapshot, insights] = await Promise.all([readService(scope), readInsights(scope, branch.timezone)]);
  // The QR links must point at the host the guest will actually reach.
  const host = (await headers()).get("host") ?? "localhost:3000";
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return <>
    <Link className="auth-demo-link" href={`/workspace/${branch.id}/fair-queue`}>Fair Queue · seating plan and guest requirements →</Link>
    <ServiceConsole branchId={branch.id} currency={branch.currency} origin={origin} snapshot={snapshot} insights={insights} canBill={hasPermission(branch.role, "billing:manage")} canQueue={hasPermission(branch.role, "queue:manage")} locale={locale}/>
  </>;
}
