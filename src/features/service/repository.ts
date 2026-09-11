import "server-only";
import { and, asc, desc, eq, inArray, sql as raw } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase } from "@/db";
import { branches, branchStaff, diningTables, floors, layoutVersions, memberships, menuItems, orderItems, orders, queueEntries, queueSeatingEvents } from "@/db/schema";
import { canSeat, planSeating, type QueueParty, type ServiceTable } from "@/features/queue/recommend";
import { hasPermission, resolveBranchRole } from "@/features/tenancy/permissions";
import { canvasSchema, type FloorCanvas } from "@/features/floor/model";
import { canAdvanceOrder, type OrderStatus } from "@/features/orders/model";

export class ServiceError extends Error {}
type Scope = { branchId: string; organizationId: string };
type QueueActor = Scope & { userId: string };
type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const scopeOf = (table: { branchId: unknown; organizationId: unknown }, scope: Scope) =>
  and(eq(table.branchId as never, scope.branchId), eq(table.organizationId as never, scope.organizationId));

export type ServiceSnapshot = Awaited<ReturnType<typeof readService>>;

async function lockQueueHost(tx: Transaction, actor: QueueActor) {
  const [branch] = await tx.select().from(branches).where(and(eq(branches.id, actor.branchId), eq(branches.organizationId, actor.organizationId))).for("update");
  if (!branch) throw new ServiceError("This branch is no longer available.");
  const [membership] = await tx.select().from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.userId, actor.userId))).for("share");
  const [assignment] = await tx.select().from(branchStaff).where(and(eq(branchStaff.branchId, actor.branchId), eq(branchStaff.organizationId, actor.organizationId), eq(branchStaff.userId, actor.userId))).for("share");
  const role = resolveBranchRole(actor.userId, branch, membership, assignment);
  if (!role || !hasPermission(role, "queue:manage")) throw new ServiceError("Your queue access has changed. Refresh and contact the restaurant owner.");
}

const asParty = (entry: typeof queueEntries.$inferSelect): QueueParty => ({ id: entry.id, name: entry.guestName, size: entry.partySize, joinedAt: entry.joinedAt.getTime(), status: entry.status, needsAccessible: entry.needsAccessible, requestedFloorId: entry.requestedFloorId });
const asTable = (table: typeof diningTables.$inferSelect): ServiceTable => ({ ...table, status: table.state, x: 0, y: 0 });

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
    // The label of the table a party was called to, for the queue rows.
    const calledTable = alias(diningTables, "called_table");
    const waiting = await tx.select({ entry: queueEntries, calledTableLabel: calledTable.label })
      .from(queueEntries).leftJoin(calledTable, eq(calledTable.id, queueEntries.calledTableId))
      .where(and(scopeOf(queueEntries, scope), inArray(queueEntries.status, ["waiting", "offered"]))).orderBy(asc(queueEntries.joinedAt));
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
      generatedAt: Date.now(),
      rooms: rooms.map(room => ({ id: room.id, name: room.name, canvas: layouts.get(room.id) ?? null })),
      items,
      tables: tables.map(table => ({ id: table.id, floorId: table.floorId, label: table.label, capacity: table.capacity, accessible: table.accessible, state: table.state })),
      queue: waiting.map(({ entry, calledTableLabel }) => ({ id: entry.id, guestName: entry.guestName, partySize: entry.partySize, status: entry.status, joinedAt: entry.joinedAt.getTime(), needsAccessible: entry.needsAccessible, requestedFloorId: entry.requestedFloorId, calledTableLabel })),
      bills: open.map(bill => ({ ...bill, createdAt: bill.createdAt.getTime() })),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function addToQueue(actor: QueueActor, guestName: string, partySize: number, needsAccessible: boolean, requestedFloorId: string | null) {
  return getDatabase().transaction(async tx => {
    await lockQueueHost(tx, actor);
    if (requestedFloorId) {
      const [floor] = await tx.select({ id: floors.id }).from(floors).where(and(eq(floors.id, requestedFloorId), scopeOf(floors, actor)));
      if (!floor) throw new ServiceError("Choose a seating area in this branch.");
    }
    const [entry] = await tx.insert(queueEntries).values({ branchId: actor.branchId, organizationId: actor.organizationId, guestName, partySize, needsAccessible, requestedFloorId }).returning({ id: queueEntries.id });
    return entry;
  });
}

// Seating is the moment a table stops being free, so it locks the table row and
// re-checks both sides. Two hosts tapping the same table cannot double-seat it.
export async function seatParty(scope: QueueActor, tableId: string, entryId: string | null, overrideReason = "") {
  return getDatabase().transaction(async tx => {
    await lockQueueHost(tx, scope);
    // One locked snapshot for every competing table and party. This makes stale
    // recommendations harmless and follows the floor publisher's lock order.
    const allTables = await tx.select().from(diningTables).where(and(scopeOf(diningTables, scope), eq(diningTables.enabled, true))).orderBy(asc(diningTables.id)).for("update");
    const table = allTables.find(t => t.id === tableId);
    if (!table || !table.enabled) throw new ServiceError("That table is no longer in service.");
    const waiting = await tx.select().from(queueEntries).where(and(scopeOf(queueEntries, scope), inArray(queueEntries.status, ["waiting", "offered"]))).orderBy(asc(queueEntries.id)).for("update");
    // A table held by calling a party is taken for everyone except that party.
    const heldFor = waiting.find(item => item.status === "offered" && item.calledTableId === table.id);
    const arriving = table.state === "reserved" && Boolean(entryId) && heldFor?.id === entryId;
    if (table.state !== "available" && !arriving) throw new ServiceError(`Table ${table.label} is already ${table.state}.`);
    const [clock] = await tx.select({ now: raw<string>`clock_timestamp()::text` }).from(branches).where(eq(branches.id, scope.branchId));
    const seatedAt = new Date(clock.now);
    const plan = planSeating(allTables.map(asTable), waiting.map(asParty), seatedAt.getTime());
    const suggestion = plan.find(item => item.table.id === table.id);
    let decision: "recommended" | "override" | "walk_in" = "walk_in";
    let reason = "Walk-in seated; no waiting party assigned to this table.";
    if (entryId) {
      const entry = waiting.find(item => item.id === entryId);
      if (!entry) throw new ServiceError("That party is no longer waiting.");
      // The call already checked the fit; re-check it against the state that
      // existed then, not the hold the call itself created.
      const fitTable = arriving ? { ...asTable(table), status: "available" as const } : asTable(table);
      const fitParty = arriving ? { ...asParty(entry), status: "waiting" as const } : asParty(entry);
      if (!canSeat(fitTable, fitParty)) throw new ServiceError("This table does not meet the party’s size, accessibility, seating area, or queue status requirements.");
      if (arriving) { decision = "recommended"; reason = "Seated from the call board."; }
      else if (suggestion?.party.id === entry.id) { decision = "recommended"; reason = suggestion.reason; }
      else {
        if (overrideReason.trim().length < 5) throw new ServiceError("The seating recommendation has changed. Refresh, or add a reason to choose a different match.");
        decision = "override"; reason = overrideReason.trim();
      }
      await tx.update(queueEntries).set({ status: "seated", seatedTableId: table.id, seatedAt, seatedBy: scope.userId, seatingReason: reason }).where(and(eq(queueEntries.id, entry.id), scopeOf(queueEntries, scope)));
    } else if (suggestion) {
      if (overrideReason.trim().length < 5) throw new ServiceError("A waiting party is recommended for this table. Add a reason before seating a walk-in.");
      decision = "override"; reason = overrideReason.trim();
    }
    await tx.update(diningTables).set({ state: "occupied" }).where(eq(diningTables.id, table.id));
    // Opening the bill with the seating keeps a served table from ever lacking one.
    const [bill] = await tx.insert(orders).values({ branchId: scope.branchId, organizationId: scope.organizationId, tableId: table.id }).returning({ id: orders.id });
    await tx.insert(queueSeatingEvents).values({ branchId: scope.branchId, organizationId: scope.organizationId, tableId: table.id, queueEntryId: entryId, actorId: scope.userId, decision, reason, createdAt: seatedAt });
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

// Calling a party holds the table for them, so the person walking to the front
// of the shop still has somewhere to sit. Both rows are locked before either
// changes, in the same table-then-queue order the seating path uses.
export async function callParty(actor: QueueActor, entryId: string, tableId: string) {
  return getDatabase().transaction(async tx => {
    await lockQueueHost(tx, actor);
    const [table] = await tx.select().from(diningTables)
      .where(and(eq(diningTables.id, tableId), scopeOf(diningTables, actor))).for("update");
    if (!table || !table.enabled) throw new ServiceError("That table is no longer in service.");
    if (table.state !== "available") throw new ServiceError(`Table ${table.label} is already ${table.state}.`);
    const [entry] = await tx.select().from(queueEntries)
      .where(and(eq(queueEntries.id, entryId), scopeOf(queueEntries, actor))).for("update");
    if (!entry) throw new ServiceError("That party is no longer waiting.");
    if (entry.status !== "waiting") throw new ServiceError(`${entry.guestName}'s party was already ${entry.status}.`);
    if (entry.partySize > table.capacity) throw new ServiceError(`${entry.guestName}'s party of ${entry.partySize} does not fit ${table.capacity} seats.`);

    const [clock] = await tx.select({ now: raw<string>`clock_timestamp()::text` }).from(branches).where(eq(branches.id, actor.branchId));
    await tx.update(queueEntries).set({ status: "offered", calledAt: new Date(clock.now), calledTableId: table.id }).where(eq(queueEntries.id, entry.id));
    await tx.update(diningTables).set({ state: "reserved" }).where(eq(diningTables.id, table.id));
    return { guestName: entry.guestName, label: table.label };
  });
}

// A called party who never arrives must not hold the table forever.
export async function releaseCall(actor: QueueActor, entryId: string) {
  return getDatabase().transaction(async tx => {
    await lockQueueHost(tx, actor);
    const [entry] = await tx.select().from(queueEntries)
      .where(and(eq(queueEntries.id, entryId), scopeOf(queueEntries, actor))).for("update");
    if (!entry) throw new ServiceError("That party is no longer in the queue.");
    if (entry.status !== "offered") throw new ServiceError(`${entry.guestName}'s party is ${entry.status}, not called.`);
    if (entry.calledTableId) {
      const [table] = await tx.select().from(diningTables)
        .where(and(eq(diningTables.id, entry.calledTableId), scopeOf(diningTables, actor))).for("update");
      // Only give the table back if it is still only being held for them.
      if (table && table.state === "reserved") await tx.update(diningTables).set({ state: "available" }).where(eq(diningTables.id, table.id));
    }
    await tx.update(queueEntries).set({ status: "no_show", calledAt: null, calledTableId: null }).where(eq(queueEntries.id, entry.id));
    return { guestName: entry.guestName };
  });
}

// Read for the public call display. Returns only what a screen in the shop
// shows: who is called, to which table, and who is still waiting.
export async function readCallBoard(scope: Scope) {
  const rows = await getDatabase().select({
    id: queueEntries.id, guestName: queueEntries.guestName, partySize: queueEntries.partySize,
    status: queueEntries.status, joinedAt: queueEntries.joinedAt, calledAt: queueEntries.calledAt,
    tableLabel: diningTables.label,
  }).from(queueEntries)
    .leftJoin(diningTables, eq(diningTables.id, queueEntries.calledTableId))
    .where(and(scopeOf(queueEntries, scope), inArray(queueEntries.status, ["waiting", "offered"])))
    .orderBy(asc(queueEntries.joinedAt));

  return {
    called: rows.filter(row => row.status === "offered")
      .map(row => ({ id: row.id, guestName: row.guestName, partySize: row.partySize, tableLabel: row.tableLabel, calledAt: row.calledAt?.getTime() ?? 0 }))
      .sort((a, b) => b.calledAt - a.calledAt),
    waiting: rows.filter(row => row.status === "waiting")
      .map(row => ({ id: row.id, guestName: row.guestName, partySize: row.partySize })),
  };
}
