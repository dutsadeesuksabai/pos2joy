import "server-only";
import { and, asc, eq, inArray, sql as raw } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase } from "@/db";
import { branches, branchStaff, diningTables, floors, memberships, menuItems, orderItems, orders, queueEntries, queueSeatingEvents, restaurants } from "@/db/schema";
import { canSeat, planSeating, type QueueParty, type ServiceTable } from "@/features/queue/recommend";
import { hasPermission, resolveBranchRole } from "@/features/tenancy/permissions";
import { serviceDayIn } from "@/features/queue/ticket";
import { canAdvanceOrder, type OrderStatus } from "@/features/orders/model";

export class ServiceError extends Error {}
type Scope = { branchId: string; organizationId: string };
type QueueActor = Scope & { userId: string };
type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const scopeOf = (table: { branchId: unknown; organizationId: unknown }, scope: Scope) =>
  and(eq(table.branchId as never, scope.branchId), eq(table.organizationId as never, scope.organizationId));

export { readService } from "./reads";
export type { ServiceSnapshot } from "./reads";

async function lockQueueHost(tx: Transaction, actor: QueueActor) {
  const [branch] = await tx.select().from(branches).where(and(eq(branches.id, actor.branchId), eq(branches.organizationId, actor.organizationId))).for("update");
  if (!branch) throw new ServiceError("This branch is no longer available.");
  const [membership] = await tx.select().from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.userId, actor.userId))).for("share");
  const [assignment] = await tx.select().from(branchStaff).where(and(eq(branchStaff.branchId, actor.branchId), eq(branchStaff.organizationId, actor.organizationId), eq(branchStaff.userId, actor.userId))).for("share");
  const role = resolveBranchRole(actor.userId, branch, membership, assignment);
  if (!role || !hasPermission(role, "queue:manage")) throw new ServiceError("Your queue access has changed. Refresh and contact the restaurant owner.");
  return branch;
}

const asParty = (entry: typeof queueEntries.$inferSelect): QueueParty => ({ id: entry.id, name: entry.guestName, size: entry.partySize, joinedAt: entry.joinedAt.getTime(), status: entry.status, needsAccessible: entry.needsAccessible, requestedFloorId: entry.requestedFloorId });
const asTable = (table: typeof diningTables.$inferSelect): ServiceTable => ({ ...table, status: table.state, x: 0, y: 0 });

export async function addToQueue(actor: QueueActor, guestName: string, partySize: number, needsAccessible: boolean, requestedFloorId: string | null) {
  return getDatabase().transaction(async tx => {
    const branch = await lockQueueHost(tx, actor);
    if (requestedFloorId) {
      const [floor] = await tx.select({ id: floors.id }).from(floors).where(and(eq(floors.id, requestedFloorId), scopeOf(floors, actor)));
      if (!floor) throw new ServiceError("Choose a seating area in this branch.");
    }
    // The branch row is already locked, so max + 1 cannot race another host.
    const serviceDay = serviceDayIn(branch.timezone);
    const [last] = await tx.select({ highest: raw<number | null>`max(${queueEntries.ticketNo})` })
      .from(queueEntries).where(and(scopeOf(queueEntries, actor), eq(queueEntries.serviceDay, serviceDay)));
    const ticketNo = (last?.highest ?? 0) + 1;
    const [entry] = await tx.insert(queueEntries).values({ branchId: actor.branchId, organizationId: actor.organizationId, guestName, partySize, needsAccessible, requestedFloorId, serviceDay, ticketNo })
      .returning({ id: queueEntries.id, ticketNo: queueEntries.ticketNo });
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
    if (!canSeat(asTable(table), asParty(entry))) throw new ServiceError("This table does not meet the party's capacity, accessibility, or seating area requirements.");

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
    id: queueEntries.id, guestName: queueEntries.guestName, partySize: queueEntries.partySize, ticketNo: queueEntries.ticketNo,
    status: queueEntries.status, joinedAt: queueEntries.joinedAt, calledAt: queueEntries.calledAt,
    tableLabel: diningTables.label,
  }).from(queueEntries)
    .leftJoin(diningTables, eq(diningTables.id, queueEntries.calledTableId))
    .where(and(scopeOf(queueEntries, scope), inArray(queueEntries.status, ["waiting", "offered"])))
    .orderBy(asc(queueEntries.joinedAt));

  return {
    called: rows.filter(row => row.status === "offered")
      .map(row => ({ id: row.id, guestName: row.guestName, partySize: row.partySize, ticketNo: row.ticketNo, tableLabel: row.tableLabel, calledAt: row.calledAt?.getTime() ?? 0 }))
      .sort((a, b) => b.calledAt - a.calledAt),
    waiting: rows.filter(row => row.status === "waiting")
      .map(row => ({ id: row.id, guestName: row.guestName, partySize: row.partySize, ticketNo: row.ticketNo })),
  };
}

// Public read for the slip QR: the guest holds an entry ID and nothing else.
// Returns only what their own ticket shows, plus how many are ahead of them.
export async function readQueueTicket(entryId: string) {
  const called = alias(diningTables, "ticket_table");
  const earlier = alias(queueEntries, "earlier_entry");
  const [row] = await getDatabase().select({
    id: queueEntries.id, ticketNo: queueEntries.ticketNo, guestName: queueEntries.guestName,
    partySize: queueEntries.partySize, status: queueEntries.status, joinedAt: queueEntries.joinedAt,
    serviceDay: queueEntries.serviceDay, branchId: queueEntries.branchId, organizationId: queueEntries.organizationId,
    tableLabel: called.label, branchName: branches.name, restaurantName: restaurants.name,
    // Correlated count shares the ticket statement's snapshot and round trip.
    ahead: raw<number>`(select count(*)::int from ${queueEntries} as earlier_entry where ${earlier.branchId} = ${queueEntries.branchId} and ${earlier.organizationId} = ${queueEntries.organizationId} and ${earlier.serviceDay} = ${queueEntries.serviceDay} and ${earlier.status} = 'waiting' and ${earlier.ticketNo} < ${queueEntries.ticketNo})`,
  }).from(queueEntries)
    .innerJoin(branches, and(eq(branches.id, queueEntries.branchId), eq(branches.organizationId, queueEntries.organizationId)))
    .innerJoin(restaurants, and(eq(restaurants.id, branches.restaurantId), eq(restaurants.organizationId, branches.organizationId)))
    .leftJoin(called, eq(called.id, queueEntries.calledTableId))
    .where(eq(queueEntries.id, entryId));
  if (!row) return null;

  return { ...row, joinedAt: row.joinedAt.getTime() };
}

export type BranchInsights = Awaited<ReturnType<typeof readInsights>>;

// Everything the dashboard shows, in one round trip. "Today" is the branch's own
// service day, the same boundary queue numbers reset on, so the takings a
// manager reads here match the tickets their staff handed out.
export async function readInsights(scope: Scope, timezone: string) {
  const day = serviceDayIn(timezone);
  const database = getDatabase();
  const [rows] = await database.execute(raw`
    with today as (select ${day}::date as d),
    tables as (
      select count(*) filter (where state = 'available')::int as free,
             count(*) filter (where state = 'occupied')::int as occupied,
             count(*) filter (where state = 'reserved')::int as reserved,
             count(*)::int as total,
             coalesce(sum(capacity) filter (where state = 'occupied'), 0)::int as seated_capacity,
             coalesce(sum(capacity), 0)::int as total_capacity
      from dining_tables
      where branch_id = ${scope.branchId} and organization_id = ${scope.organizationId} and enabled
    ),
    queue as (
      select count(*) filter (where status = 'waiting')::int as waiting,
             count(*) filter (where status = 'offered')::int as called,
             count(*) filter (where status = 'seated')::int as seated_today,
             count(*) filter (where status = 'no_show')::int as no_show_today,
             coalesce(sum(party_size) filter (where status = 'seated'), 0)::int as covers_today,
             coalesce(max(extract(epoch from (now() - joined_at))) filter (where status = 'waiting'), 0)::int as longest_wait_s,
             coalesce(avg(extract(epoch from (seated_at - joined_at))) filter (where status = 'seated' and seated_at is not null), 0)::int as avg_wait_s
      from queue_entries, today
      where branch_id = ${scope.branchId} and organization_id = ${scope.organizationId} and service_day = today.d
    ),
    bills as (
      select coalesce(sum(oi.unit_price_cents * oi.quantity) filter (where o.status <> 'cancelled'), 0)::int as revenue_cents,
             coalesce(sum(oi.unit_price_cents * oi.quantity) filter (where o.status in ('placed','preparing')), 0)::int as open_cents,
             count(distinct o.id) filter (where o.status in ('placed','preparing'))::int as open_bills,
             coalesce(sum(oi.quantity) filter (where o.status <> 'cancelled'), 0)::int as items_today
      from orders o join order_items oi on oi.order_id = o.id, today
      where o.branch_id = ${scope.branchId} and o.organization_id = ${scope.organizationId}
        and (o.created_at at time zone ${timezone})::date = today.d
    ),
    dishes as (
      select oi.name, sum(oi.quantity)::int as sold
      from orders o join order_items oi on oi.order_id = o.id, today
      where o.branch_id = ${scope.branchId} and o.organization_id = ${scope.organizationId}
        and o.status <> 'cancelled' and (o.created_at at time zone ${timezone})::date = today.d
      group by oi.name order by sold desc limit 3
    )
    select to_jsonb(tables) as tables, to_jsonb(queue) as queue, to_jsonb(bills) as bills,
           coalesce((select jsonb_agg(jsonb_build_object('name', name, 'sold', sold)) from dishes), '[]'::jsonb) as top
    from tables, queue, bills
  `);

  const shape = rows as unknown as { tables: Record<string, number>; queue: Record<string, number>; bills: Record<string, number>; top: { name: string; sold: number }[] };
  return {
    day,
    tables: shape.tables,
    queue: shape.queue,
    bills: shape.bills,
    topDishes: shape.top ?? [],
  };
}
