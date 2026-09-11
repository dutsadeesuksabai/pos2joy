import "server-only";
import { and, asc, eq, inArray, sql as raw } from "drizzle-orm";
import { getDatabase } from "@/db";
import { branches, diningTables, menuItems, orderItems, orders, restaurants } from "@/db/schema";
import { translate } from "@/i18n/dictionary";
import { OrderRejectedError, priceCart, tableOrderingError, type Cart } from "./model";

// A guest arrives holding nothing but the table ID printed on their QR code, so
// the table is the only thing looked up by an untrusted value. Its own row then
// supplies the branch and organisation every later query is scoped by; nothing
// from the request narrows or widens that scope.
export async function readGuestTable(tableId: string) {
  const [row] = await getDatabase().select({
    id: diningTables.id, label: diningTables.label, capacity: diningTables.capacity,
    enabled: diningTables.enabled, state: diningTables.state,
    branchId: diningTables.branchId, organizationId: diningTables.organizationId,
    branchName: branches.name, currency: branches.currency, restaurantName: restaurants.name,
  }).from(diningTables)
    .innerJoin(branches, and(eq(branches.id, diningTables.branchId), eq(branches.organizationId, diningTables.organizationId)))
    .innerJoin(restaurants, and(eq(restaurants.id, branches.restaurantId), eq(restaurants.organizationId, branches.organizationId)))
    .where(eq(diningTables.id, tableId));
  return row ?? null;
}

export async function readGuestMenu(branchId: string, organizationId: string) {
  return getDatabase().select({ id: menuItems.id, name: menuItems.name, category: menuItems.category, kind: menuItems.kind, priceCents: menuItems.priceCents, available: menuItems.available })
    .from(menuItems)
    .where(and(eq(menuItems.branchId, branchId), eq(menuItems.organizationId, organizationId), eq(menuItems.available, true)))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.name));
}

export async function readTableOrder(tableId: string, branchId: string, organizationId: string) {
  const rows = await getDatabase().select({
    name: orderItems.name, quantity: orderItems.quantity, unitPriceCents: orderItems.unitPriceCents, status: orders.status,
  }).from(orders).innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.tableId, tableId), eq(orders.branchId, branchId), eq(orders.organizationId, organizationId), inArray(orders.status, ["placed", "preparing", "served"])))
    .orderBy(asc(orderItems.name));
  return rows;
}

// Prices come from the menu rows read inside this transaction, never from the
// cart. The table is locked so a party that has just been asked to leave cannot
// slip one more order in behind the staff closing their bill.
export async function placeGuestOrder(tableId: string, cart: Cart) {
  return getDatabase().transaction(async tx => {
    const [table] = await tx.select().from(diningTables).where(eq(diningTables.id, tableId)).for("update");
    const blocked = tableOrderingError(table);
    // Staff-facing path: translate the key for the message the server returns.
    if (blocked) throw new OrderRejectedError(translate("en", blocked));
    const scope = { branchId: table.branchId, organizationId: table.organizationId };

    const ids = cart.items.map(line => line.menuItemId);
    const menu = await tx.select().from(menuItems)
      .where(and(eq(menuItems.branchId, scope.branchId), eq(menuItems.organizationId, scope.organizationId), inArray(menuItems.id, ids)));
    const lines = priceCart(cart, menu);

    // Seating opens the bill, but a table set occupied by other means may not
    // have one; reuse whichever is open rather than starting a second.
    const [existing] = await tx.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.tableId, table.id), eq(orders.branchId, scope.branchId), eq(orders.organizationId, scope.organizationId), inArray(orders.status, ["placed", "preparing"])))
      .orderBy(asc(orders.createdAt)).for("update");
    const orderId = existing?.id ?? (await tx.insert(orders).values({ ...scope, tableId: table.id }).returning({ id: orders.id }))[0].id;

    for (const line of lines) {
      await tx.insert(orderItems).values({ ...scope, orderId, menuItemId: line.menuItemId, name: line.name, unitPriceCents: line.unitPriceCents, quantity: line.quantity })
        // A dish ordered again adds to the round already on the bill.
        .onConflictDoUpdate({ target: [orderItems.orderId, orderItems.menuItemId], set: { quantity: raw`${orderItems.quantity} + ${line.quantity}` } });
    }
    const [{ total }] = await tx.select({ total: raw<number>`coalesce(sum(${orderItems.unitPriceCents} * ${orderItems.quantity}), 0)::int` })
      .from(orderItems).where(eq(orderItems.orderId, orderId));
    return { orderId, totalCents: total, label: table.label };
  });
}
