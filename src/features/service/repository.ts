import "server-only";
import { and, asc, desc, eq, inArray, sql as raw } from "drizzle-orm";
import { getDatabase } from "@/db";
import { diningTables, floors, layoutVersions, menuItems, orderItems, orders, queueEntries } from "@/db/schema";
import { canvasSchema, type FloorCanvas } from "@/features/floor/model";
import { canAdvanceOrder, type OrderStatus } from "@/features/orders/model";

export class ServiceError extends Error {}
type Scope = { branchId: string; organizationId: string };
const scopeOf = (table: { branchId: unknown; organizationId: unknown }, scope: Scope) =>
  and(eq(table.branchId as never, scope.branchId), eq(table.organizationId as never, scope.organizationId));

export type ServiceSnapshot = Awaited<ReturnType<typeof readService>>;

// One read for the whole service screen: the published room, its live tables,
// the waiting list, and the open bill totals. Kept to a single transaction so
// a table never renders available next to the bill it still owes.
export async function readService(scope: Scope) {
  return getDatabase().transaction(async tx => {
    const rooms = await tx.select().from(floors).where(scopeOf(floors, scope)).orderBy(asc(floors.name));
    const published = rooms.length
      ? await tx.select().from(layoutVersions).where(and(scopeOf(layoutVersions, scope), eq(layoutVersions.state, "published"), inArray(layoutVersions.floorId, rooms.map(room => room.id))))
      : [];
    const layouts = new Map<string, FloorCanvas>(published.map(version => [version.floorId, canvasSchema.parse(version.canvas)]));

    const tables = await tx.select().from(diningTables).where(and(scopeOf(diningTables, scope), eq(diningTables.enabled, true))).orderBy(asc(diningTables.label));
    const waiting = await tx.select().from(queueEntries).where(and(scopeOf(queueEntries, scope), inArray(queueEntries.status, ["waiting", "offered"]))).orderBy(asc(queueEntries.joinedAt));
    const open = await tx.select({
      id: orders.id, tableId: orders.tableId, status: orders.status, createdAt: orders.createdAt,
      // Money stays in minor units all the way to the screen.
      totalCents: raw<number>`coalesce(sum(${orderItems.unitPriceCents} * ${orderItems.quantity}), 0)::int`,
      lines: raw<number>`count(${orderItems.id})::int`,
    }).from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(and(scopeOf(orders, scope), inArray(orders.status, ["placed", "preparing", "served"])))
      .groupBy(orders.id).orderBy(desc(orders.createdAt));

    // What is actually on each bill, so staff can read it back to the table.
    const items = open.length ? await tx.select({
      tableId: orders.tableId, name: orderItems.name, quantity: orderItems.quantity, unitPriceCents: orderItems.unitPriceCents,
    }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(scopeOf(orders, scope), inArray(orders.id, open.map(bill => bill.id))))
      .orderBy(asc(orderItems.name)) : [];

    return {
      rooms: rooms.map(room => ({ id: room.id, name: room.name, canvas: layouts.get(room.id) ?? null })),
      items,
      tables: tables.map(table => ({ id: table.id, floorId: table.floorId, label: table.label, capacity: table.capacity, accessible: table.accessible, state: table.state })),
      queue: waiting.map(entry => ({ id: entry.id, guestName: entry.guestName, partySize: entry.partySize, status: entry.status, joinedAt: entry.joinedAt.getTime() })),
      bills: open.map(bill => ({ ...bill, createdAt: bill.createdAt.getTime() })),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function addToQueue(scope: Scope, guestName: string, partySize: number) {
  const [entry] = await getDatabase().insert(queueEntries)
    .values({ ...scope, guestName, partySize }).returning({ id: queueEntries.id });
  return entry;
}

// Seating is the moment a table stops being free, so it locks the table row and
// re-checks both sides. Two hosts tapping the same table cannot double-seat it.
export async function seatParty(scope: Scope, tableId: string, entryId: string | null) {
  return getDatabase().transaction(async tx => {
    const [table] = await tx.select().from(diningTables)
      .where(and(eq(diningTables.id, tableId), scopeOf(diningTables, scope))).for("update");
    if (!table || !table.enabled) throw new ServiceError("That table is no longer in service.");
    if (table.state !== "available") throw new ServiceError(`Table ${table.label} is already ${table.state}.`);

    if (entryId) {
      const [entry] = await tx.select().from(queueEntries)
        .where(and(eq(queueEntries.id, entryId), scopeOf(queueEntries, scope))).for("update");
      if (!entry) throw new ServiceError("That party is no longer waiting.");
      if (entry.status !== "waiting" && entry.status !== "offered") throw new ServiceError(`${entry.guestName}'s party was already ${entry.status}.`);
      if (entry.partySize > table.capacity) throw new ServiceError(`${entry.guestName}'s party of ${entry.partySize} does not fit ${table.capacity} seats.`);
      await tx.update(queueEntries).set({ status: "seated" }).where(eq(queueEntries.id, entry.id));
    }
    await tx.update(diningTables).set({ state: "occupied" }).where(eq(diningTables.id, table.id));
    // Opening the bill with the seating keeps a served table from ever lacking one.
    const [bill] = await tx.insert(orders).values({ ...scope, tableId: table.id }).returning({ id: orders.id });
    return { label: table.label, billId: bill.id };
  });
}

export async function closeBill(scope: Scope, tableId: string) {
  return getDatabase().transaction(async tx => {
    const [table] = await tx.select().from(diningTables)
      .where(and(eq(diningTables.id, tableId), scopeOf(diningTables, scope))).for("update");
    if (!table) throw new ServiceError("That table is no longer in service.");
    await tx.update(orders).set({ status: "served" })
      .where(and(scopeOf(orders, scope), eq(orders.tableId, table.id), inArray(orders.status, ["placed", "preparing"])));
    await tx.update(diningTables).set({ state: "available" }).where(eq(diningTables.id, table.id));
    return { label: table.label };
  });
}

export async function setTableState(scope: Scope, tableId: string, state: "available" | "reserved") {
  return getDatabase().transaction(async tx => {
    const [table] = await tx.select().from(diningTables)
      .where(and(eq(diningTables.id, tableId), scopeOf(diningTables, scope))).for("update");
    if (!table) throw new ServiceError("That table is no longer in service.");
    if (table.state === "occupied") throw new ServiceError(`Table ${table.label} is occupied. Close its bill first.`);
    await tx.update(diningTables).set({ state }).where(eq(diningTables.id, table.id));
    return { label: table.label };
  });
}

export async function readBranchMenu(scope: Scope) {
  return getDatabase().select({ id: menuItems.id, name: menuItems.name, category: menuItems.category, priceCents: menuItems.priceCents, available: menuItems.available })
    .from(menuItems).where(scopeOf(menuItems, scope)).orderBy(asc(menuItems.sortOrder), asc(menuItems.name));
}

export type KitchenTicket = Awaited<ReturnType<typeof readKitchen>>[number];

// The kitchen board: every ticket still cooking, oldest first, with its lines.
export async function readKitchen(scope: Scope) {
  const rows = await getDatabase().select({
    id: orders.id, status: orders.status, createdAt: orders.createdAt, tableLabel: diningTables.label,
    name: orderItems.name, quantity: orderItems.quantity, unitPriceCents: orderItems.unitPriceCents,
  }).from(orders)
    .innerJoin(diningTables, eq(diningTables.id, orders.tableId))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(scopeOf(orders, scope), inArray(orders.status, ["placed", "preparing"])))
    .orderBy(asc(orders.createdAt), asc(orderItems.name));

  const tickets = new Map<string, { id: string; status: string; tableLabel: string; createdAt: number; lines: { name: string; quantity: number; unitPriceCents: number }[] }>();
  for (const row of rows) {
    const ticket = tickets.get(row.id) ?? { id: row.id, status: row.status, tableLabel: row.tableLabel, createdAt: row.createdAt.getTime(), lines: [] };
    if (row.name) ticket.lines.push({ name: row.name, quantity: row.quantity!, unitPriceCents: row.unitPriceCents! });
    tickets.set(row.id, ticket);
  }
  // A seated table opens an empty bill; that is not a kitchen ticket.
  return [...tickets.values()].filter(ticket => ticket.lines.length > 0);
}

export async function advanceOrder(scope: Scope, orderId: string, next: OrderStatus) {
  return getDatabase().transaction(async tx => {
    const [order] = await tx.select().from(orders)
      .where(and(eq(orders.id, orderId), scopeOf(orders, scope))).for("update");
    if (!order) throw new ServiceError("That order is no longer open.");
    const allowed = canAdvanceOrder(order.status, next);
    if (allowed === "unchanged") return { changed: false, status: order.status };
    if (!allowed) throw new ServiceError(`An order that is ${order.status} cannot become ${next}.`);
    await tx.update(orders).set({ status: next }).where(eq(orders.id, order.id));
    return { changed: true, status: next };
  });
}
