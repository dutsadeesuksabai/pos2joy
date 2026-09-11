import Link from "next/link";
import { requireUser } from "@/features/tenancy/session";
import { SignOutForm } from "@/features/tenancy/auth-forms";
import { displayIdentity } from "@/features/tenancy/identity";

export const dynamic = "force-dynamic";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="staff-shell"><header className="staff-header"><Link href="/workspace" className="brand">POS 2 <span>joy</span> ✳</Link><div><span>{displayIdentity(user.email)}</span><SignOutForm/></div></header><main className="staff-main">{children}</main></div>;
}
