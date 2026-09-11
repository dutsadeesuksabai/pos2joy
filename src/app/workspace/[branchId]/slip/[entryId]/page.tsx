import { notFound } from "next/navigation";
import { toString as qrToString } from "qrcode";
import { headers } from "next/headers";
import { requireBranch } from "@/features/tenancy/queries";
import { readQueueTicket } from "@/features/service/repository";
import { resolveLocale } from "@/i18n/dictionary";
import { QueueSlip } from "@/features/service/slip";

export const dynamic = "force-dynamic";

export default async function SlipPage({ params, searchParams }: { params: Promise<{ branchId: string; entryId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { branchId, entryId } = await params;
  const branch = await requireBranch(branchId);
  const ticket = await readQueueTicket(entryId);
  // A ticket from another branch is not found rather than printed.
  if (!ticket || ticket.branchId !== branch.id || ticket.organizationId !== branch.organizationId) notFound();

  const host = (await headers()).get("host") ?? "localhost:3000";
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const { lang } = await searchParams;
  const locale = resolveLocale(lang);
  // Inlined rather than fetched, so the slip prints even on a till with no
  // network left, and no table link reaches a third-party QR service.
  const qr = await qrToString(`${origin}/q/${ticket.id}?lang=${locale}`, { type: "svg", margin: 0, width: 220, errorCorrectionLevel: "M" });
  return <QueueSlip locale={locale} ticket={ticket} qrSvg={qr} url={`${origin}/q/${ticket.id}`}/>;
}
