export const branchRoles = ["owner", "manager", "host", "server", "kitchen", "cashier"] as const;
export type BranchRole = typeof branchRoles[number];
export type Permission = "branch:read" | "floor:edit" | "queue:manage" | "orders:serve" | "kitchen:manage" | "billing:manage" | "team:manage" | "menu:manage" | "reports:view";

const permissions: Record<BranchRole, readonly Permission[]> = {
  owner: ["branch:read", "floor:edit", "queue:manage", "orders:serve", "kitchen:manage", "billing:manage", "team:manage", "menu:manage", "reports:view"],
  manager: ["branch:read", "floor:edit", "queue:manage", "orders:serve", "kitchen:manage", "billing:manage", "team:manage", "menu:manage", "reports:view"],
  host: ["branch:read", "queue:manage"],
  server: ["branch:read", "orders:serve"],
  kitchen: ["branch:read", "kitchen:manage"],
  cashier: ["branch:read", "queue:manage", "billing:manage"],
};

export function hasPermission(role: string, permission: Permission) {
  return Object.hasOwn(permissions, role) && permissions[role as BranchRole].includes(permission);
}

export type Membership = { organizationId: string; userId: string; role: string };
export type Assignment = { organizationId: string; branchId: string; userId: string; role: string };

// Inputs must come from verified identity and database records, never form fields.
export function resolveBranchRole(userId: string, branch: { id: string; organizationId: string }, membership: Membership | undefined, assignment?: Assignment): BranchRole | null {
  if (!membership || membership.userId !== userId || membership.organizationId !== branch.organizationId) return null;
  if (membership.role === "owner") return "owner";
  if (membership.role !== "member" || !assignment || assignment.userId !== userId || assignment.branchId !== branch.id || assignment.organizationId !== branch.organizationId) return null;
  return branchRoles.includes(assignment.role as BranchRole) && assignment.role !== "owner" ? assignment.role as BranchRole : null;
}
