import Link from "next/link";
import { cookies, headers } from "next/headers";
import { resolveLocale } from "@/i18n/dictionary";
import { LocaleSwitch } from "@/i18n/locale-switch";
import { requireUser } from "@/features/tenancy/session";
import { SignOutForm } from "@/features/tenancy/auth-forms";
import { displayIdentity } from "@/features/tenancy/identity";

export const dynamic = "force-dynamic";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const locale = resolveLocale((await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
  return <div className="staff-shell"><header className="staff-header"><Link href="/workspace" className="brand">POS 2 <span>joy</span> ✳</Link><div><LocaleSwitch current={locale}/><span>{displayIdentity(user.email)}</span><SignOutForm/></div></header><main className="staff-main">{children}</main></div>;
}
