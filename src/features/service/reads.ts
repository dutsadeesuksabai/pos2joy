import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDatabase } from "@/db";
import { diningTables, floors, orderItems, orders, queueEntries } from "@/db/schema";
import { summarizeBills } from "./bill-summary";

type Scope = { branchId: string; organizationId: string };
type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const snapshotOptions = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

function readTables(tx: Transaction, scope: Scope) {
  return tx.select({ id: diningTables.id, floorId: diningTables.floorId, label: diningTables.label, capacity: diningTables.capacity, accessible: diningTables.accessible, state: diningTables.state })
    .from(diningTables).where(and(eq(diningTables.branchId, scope.branchId), eq(diningTables.organizationId, scope.organizationId), eq(diningTables.enabled, true))).orderBy(asc(diningTables.label));
}

async function readQueue(tx: Transaction, scope: Scope) {
  const calledTable = alias(diningTables, "called_table");
  const rows = await tx.select({ id: queueEntries.id, ticketNo: queueEntries.ticketNo, guestName: queueEntries.guestName, partySize: queueEntries.partySize, status: queueEntries.status, joinedAt: queueEntries.joinedAt, needsAccessible: queueEntries.needsAccessible, requestedFloorId: queueEntries.requestedFloorId, calledTableLabel: calledTable.label })
    .from(queueEntries).leftJoin(calledTable, eq(calledTable.id, queueEntries.calledTableId))
    .where(and(eq(queueEntries.branchId, scope.branchId), eq(queueEntries.organizationId, scope.organizationId), inArray(queueEntries.status, ["waiting", "offered"])))
    .orderBy(asc(queueEntries.joinedAt), asc(queueEntries.id));
  return rows.map(row => ({ ...row, joinedAt: row.joinedAt.getTime() }));
}

// The caller must authorize the branch. No cache shared across requests: live
// queue and table state always come from one consistent database snapshot.
export async function readFairQueue(scope: Scope) {
  return getDatabase().transaction(async tx => {
    const rooms = await tx.select({ id: floors.id, name: floors.name }).from(floors)
      .where(and(eq(floors.branchId, scope.branchId), eq(floors.organizationId, scope.organizationId))).orderBy(asc(floors.name));
    const tables = await readTables(tx, scope);
    const queue = await readQueue(tx, scope);
    return { generatedAt: Date.now(), rooms, tables, queue };
  }, snapshotOptions);
}

export async function readService(scope: Scope) {
  return getDatabase().transaction(async tx => {
    const tables = await readTables(tx, scope);
    const queue = await readQueue(tx, scope);
    const rows = await tx.select({ id: orders.id, tableId: orders.tableId, status: orders.status, createdAt: orders.createdAt, name: orderItems.name, quantity: orderItems.quantity, unitPriceCents: orderItems.unitPriceCents })
      .from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.branchId, scope.branchId), eq(orders.organizationId, scope.organizationId), inArray(orders.status, ["placed", "preparing", "served"])))
      .orderBy(asc(orderItems.name));
    return { generatedAt: Date.now(), tables, queue, ...summarizeBills(rows) };
  }, snapshotOptions);
}

export type ServiceSnapshot = Awaited<ReturnType<typeof readService>>;
export type FairQueueSnapshot = Awaited<ReturnType<typeof readFairQueue>>;
