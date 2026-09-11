"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// One row of tabs replaces the landing page that only held three links.
export function BranchTabs({ branchId, tabs }: { branchId: string; tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return <nav className="branch-tabs" aria-label="Sections">
    {tabs.map(tab => {
      const href = `/workspace/${branchId}${tab.href}`;
      return <Link key={tab.href} href={href} aria-current={path === href ? "page" : undefined}>{tab.label}</Link>;
    })}
  </nav>;
}
