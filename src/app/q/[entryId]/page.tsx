import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { readQueueTicket } from "@/features/service/repository";
import { resolveLocale } from "@/i18n/dictionary";
import { QueueTicketView } from "@/features/service/queue-ticket";

// Public: the entry ID printed on the slip is the credential, like a table QR.
// It reveals only the holder's own ticket plus a count of parties ahead.
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QueueTicketPage({ params, searchParams }: { params: Promise<{ entryId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { entryId } = await params;
  if (!uuid.test(entryId)) notFound();
  const ticket = await readQueueTicket(entryId);
  if (!ticket) notFound();
  const { lang } = await searchParams;
  const locale = resolveLocale(lang, (await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
  return <QueueTicketView locale={locale} ticket={ticket}/>;
}
