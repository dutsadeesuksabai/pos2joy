import "server-only";
import { and, asc, eq, ne, sql as raw } from "drizzle-orm";
import { getDatabase } from "@/db";
import { branches, menuItems, restaurants } from "@/db/schema";

export class MenuError extends Error {}
type Scope = { branchId: string; organizationId: string };
const scoped = (scope: Scope) => and(eq(menuItems.branchId, scope.branchId), eq(menuItems.organizationId, scope.organizationId));

export type MenuRow = Awaited<ReturnType<typeof readMenu>>[number];

export async function readMenu(scope: Scope) {
  return getDatabase().select({
    id: menuItems.id, name: menuItems.name, category: menuItems.category, kind: menuItems.kind,
    priceCents: menuItems.priceCents, available: menuItems.available, sortOrder: menuItems.sortOrder,
  }).from(menuItems).where(scoped(scope)).orderBy(asc(menuItems.kind), asc(menuItems.sortOrder), asc(menuItems.name));
}

// Only sister branches, so a menu can never be copied out of another business.
export async function listSisterBranches(scope: Scope) {
  return getDatabase().select({
    id: branches.id, name: branches.name, restaurantName: restaurants.name,
    items: raw<number>`(select count(*)::int from ${menuItems} where ${menuItems.branchId} = ${branches.id})`,
  }).from(branches)
    .innerJoin(restaurants, and(eq(restaurants.id, branches.restaurantId), eq(restaurants.organizationId, branches.organizationId)))
    .where(and(eq(branches.organizationId, scope.organizationId), ne(branches.id, scope.branchId)))
    .orderBy(asc(restaurants.name), asc(branches.name));
}

export type MenuInput = { name: string; category: string; kind: "a_la_carte" | "buffet"; priceCents: number; available: boolean; sortOrder: number };

export async function createMenuItem(scope: Scope, input: MenuInput) {
  const [row] = await getDatabase().insert(menuItems).values({ ...scope, ...input })
    .onConflictDoNothing({ target: [menuItems.branchId, menuItems.name] }).returning({ id: menuItems.id });
  if (!row) throw new MenuError(`“${input.name}” is already on this menu.`);
  return row;
}

export async function updateMenuItem(scope: Scope, id: string, input: Partial<MenuInput>) {
  const [row] = await getDatabase().update(menuItems).set(input)
    .where(and(eq(menuItems.id, id), scoped(scope))).returning({ id: menuItems.id });
  if (!row) throw new MenuError("That dish is no longer on this menu.");
  return row;
}

// Removing a dish that is already on a bill would orphan the bill, so a dish
// that has ever been ordered is retired instead of deleted.
export async function removeMenuItem(scope: Scope, id: string) {
  return getDatabase().transaction(async tx => {
    const [item] = await tx.select().from(menuItems).where(and(eq(menuItems.id, id), scoped(scope))).for("update");
    if (!item) throw new MenuError("That dish is no longer on this menu.");
    const [{ used }] = await tx.select({ used: raw<number>`count(*)::int` })
      .from(raw`order_items`).where(raw`order_items.menu_item_id = ${id}`);
    if (used > 0) {
      await tx.update(menuItems).set({ available: false }).where(eq(menuItems.id, id));
      return { retired: true, name: item.name };
    }
    await tx.delete(menuItems).where(eq(menuItems.id, id));
    return { retired: false, name: item.name };
  });
}

// Copies a sister branch's menu in one transaction. Dishes this branch already
// has by name are left exactly as they are, so a re-run tops up rather than
// overwriting prices somebody has since adjusted here.
export async function duplicateMenu(scope: Scope, sourceBranchId: string) {
  return getDatabase().transaction(async tx => {
    const [source] = await tx.select({ id: branches.id }).from(branches)
      .where(and(eq(branches.id, sourceBranchId), eq(branches.organizationId, scope.organizationId)));
    if (!source) throw new MenuError("That branch is not part of this business.");
    if (source.id === scope.branchId) throw new MenuError("Choose a different branch to copy from.");

    const rows = await tx.select().from(menuItems)
      .where(and(eq(menuItems.branchId, source.id), eq(menuItems.organizationId, scope.organizationId)));
    if (rows.length === 0) throw new MenuError("That branch has no menu to copy yet.");

    let copied = 0;
    for (const row of rows) {
      const [made] = await tx.insert(menuItems).values({
        branchId: scope.branchId, organizationId: scope.organizationId,
        name: row.name, category: row.category, kind: row.kind,
        priceCents: row.priceCents, available: row.available, sortOrder: row.sortOrder,
      }).onConflictDoNothing({ target: [menuItems.branchId, menuItems.name] }).returning({ id: menuItems.id });
      if (made) copied++;
    }
    return { copied, skipped: rows.length - copied };
  });
}
