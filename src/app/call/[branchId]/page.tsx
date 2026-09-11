import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { resolveLocale } from "@/i18n/dictionary";
import { getDatabase } from "@/db";
import { branches, restaurants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { readCallBoard } from "@/features/service/repository";
import { CallDisplay } from "@/features/service/call-display";

// A screen for the shop wall, so it is public like the table QR links: the
// branch ID is the credential. It shows guest names and table numbers only.
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CallPage({ params, searchParams }: { params: Promise<{ branchId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { branchId } = await params;
  const { lang } = await searchParams;
  const locale = resolveLocale(lang, (await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
  if (!uuid.test(branchId)) notFound();
  const [branch] = await getDatabase().select({ id: branches.id, organizationId: branches.organizationId, name: branches.name, restaurantName: restaurants.name })
    .from(branches)
    .innerJoin(restaurants, and(eq(restaurants.id, branches.restaurantId), eq(restaurants.organizationId, branches.organizationId)))
    .where(eq(branches.id, branchId));
  if (!branch) notFound();
  const board = await readCallBoard({ branchId: branch.id, organizationId: branch.organizationId });
  return <CallDisplay restaurant={branch.restaurantName} branch={branch.name} board={board} locale={locale}/>;
}
