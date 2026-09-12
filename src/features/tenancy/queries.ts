import "server-only";
import { cache } from "react";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDatabase } from "@/db";
import { branches, branchStaff, memberships, restaurants } from "@/db/schema";
import { requireUser } from "./session";
import { hasPermission, resolveBranchRole, type Permission } from "./permissions";

// SQL authorization limits the result set; the pure policy below checks it again.
// Do not accept a user ID or role from a request argument.
async function queryAuthorizedBranches(branchId?: string) {
  const user = await requireUser();
  const rows = await getDatabase().select({
    id: branches.id, organizationId: branches.organizationId, name: branches.name,
    restaurantName: restaurants.name, timezone: branches.timezone, currency: branches.currency,
    membershipRole: memberships.role, staffRole: branchStaff.role,
  }).from(branches)
    .innerJoin(restaurants, and(eq(restaurants.id, branches.restaurantId), eq(restaurants.organizationId, branches.organizationId)))
    .innerJoin(memberships, and(eq(memberships.organizationId, branches.organizationId), eq(memberships.userId, user.id)))
    .leftJoin(branchStaff, and(eq(branchStaff.branchId, branches.id), eq(branchStaff.organizationId, branches.organizationId), eq(branchStaff.userId, user.id)))
    .where(and(branchId ? eq(branches.id, branchId) : undefined, or(eq(memberships.role, "owner"), isNotNull(branchStaff.id))))
    .orderBy(restaurants.name, branches.name);

  return rows.flatMap(row => {
    const role = resolveBranchRole(user.id, row,
      { organizationId: row.organizationId, userId: user.id, role: row.membershipRole },
      row.staffRole ? { organizationId: row.organizationId, branchId: row.id, userId: user.id, role: row.staffRole } : undefined);
    if (!role) return [];
    return [{ id: row.id, organizationId: row.organizationId, name: row.name, restaurantName: row.restaurantName, timezone: row.timezone, currency: row.currency, role }];
  });
}

// Request-local only: a role change is visible on the next request. Cache the
// branch lookup independently of the permission so layout + page share one SQL.
export const listAuthorizedBranches = cache(() => queryAuthorizedBranches());
const readAuthorizedBranch = cache(async (branchId: string) => (await queryAuthorizedBranches(branchId))[0]);

export const requireBranch = cache(async (branchId: string, permission: Permission = "branch:read") => {
  // An inaccessible and nonexistent branch produce the same response.
  await requireUser();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) notFound();
  const branch = await readAuthorizedBranch(branchId);
  if (!branch || !hasPermission(branch.role, permission)) notFound();
  return branch;
});
