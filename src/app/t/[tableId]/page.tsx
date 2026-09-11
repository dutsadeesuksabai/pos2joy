import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { resolveLocale } from "@/i18n/dictionary";
import { readGuestMenu, readGuestTable, readTableOrder } from "@/features/orders/repository";
import { tableOrderingError } from "@/features/orders/model";
import { GuestMenu } from "@/features/orders/guest-menu";

// The guest route is public by design: the QR code is the credential. It is not
// matched by proxy.ts and never reads the staff session.
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GuestTablePage({ params, searchParams }: { params: Promise<{ tableId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { tableId } = await params;
  const { lang } = await searchParams;
  const locale = resolveLocale(lang, (await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
  if (!uuid.test(tableId)) notFound();
  const table = await readGuestTable(tableId);
  if (!table) notFound();
  const blocked = tableOrderingError(table);
  const [menu, placed] = await Promise.all([
    readGuestMenu(table.branchId, table.organizationId),
    blocked ? Promise.resolve([]) : readTableOrder(table.id, table.branchId, table.organizationId),
  ]);
  return <GuestMenu tableId={table.id} label={table.label} restaurant={table.restaurantName} currency={table.currency} menu={menu} placed={placed} blocked={blocked} locale={locale}/>;
}
