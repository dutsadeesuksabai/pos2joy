import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/features/tenancy/queries";
import { hasPermission } from "@/features/tenancy/permissions";
import { readFloorWorkspace } from "@/features/floor/repository";
import { FloorEditor } from "@/features/floor/editor";

export default async function FloorPage({ params, searchParams }: { params: Promise<{ branchId: string }>; searchParams: Promise<{ floor?: string }> }) {
  const { branchId } = await params;
  const branch = await requireBranch(branchId);
  const { floor } = await searchParams;
  const data = await readFloorWorkspace(branch.id, branch.organizationId, floor);
  if (floor && !data.snapshot) notFound();
  const canEdit = hasPermission(branch.role, "floor:edit");
  const snapshot = data.snapshot ? { ...data.snapshot, draft: canEdit ? data.snapshot.draft : null } : null;
  return <><Link href={`/workspace/${branch.id}`} className="auth-demo-link">← {branch.restaurantName} · {branch.name}</Link><div className="eyebrow">YOUR SPACE, YOUR WAY</div><h1>Make room for good times.</h1><p className="staff-description">Build your room, place your tables, and publish when everything feels right.</p><FloorEditor key={`${data.snapshot?.id ?? "empty"}:${data.snapshot?.revision ?? 0}`} branchId={branch.id} floors={data.floors} snapshot={snapshot} canEdit={canEdit}/></>;
}
