import { cookies } from "next/headers";
import { resolveLocale, translate } from "@/i18n/dictionary";
import { requireBranch } from "@/features/tenancy/queries";
import { readDailySeries } from "@/features/reports/repository";
import { DailyCharts } from "@/features/reports/charts";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const locale = resolveLocale((await cookies()).get("lang")?.value);
  // Takings and trends are for whoever runs the business, not the front desk.
  const branch = await requireBranch(branchId, "reports:view");
  const series = await readDailySeries({ branchId: branch.id, organizationId: branch.organizationId }, branch.timezone);
  const traded = series.days.some(day => day.revenueCents || day.covers || day.orders);
  return <>
    <p className="report-span">{translate(locale, "report.span")} · {series.from} → {series.to} · {branch.timezone}</p>
    {traded
      ? <DailyCharts rows={series.days} currency={branch.currency} locale={locale}/>
      : <p className="pos-empty">{translate(locale, "report.empty")}</p>}
  </>;
}
