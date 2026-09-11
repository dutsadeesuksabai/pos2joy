"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBranch } from "@/features/tenancy/queries";
import { addToQueue, advanceOrder, closeBill, seatParty, setTableState, ServiceError } from "./repository";

// requireBranch returns the branch as `id`; the repository scopes on `branchId`.
const scopeOf = (branch: { id: string; organizationId: string }) => ({ branchId: branch.id, organizationId: branch.organizationId });

export type ServiceResult = { ok: true; message: string } | { ok: false; error: string };

const uuid = z.string().uuid();
const joinSchema = z.object({ branchId: uuid, guestName: z.string().trim().min(1).max(60), partySize: z.number().int().min(1).max(30) }).strict();
const seatSchema = z.object({ branchId: uuid, tableId: uuid, entryId: uuid.nullable() }).strict();
const tableSchema = z.object({ branchId: uuid, tableId: uuid }).strict();
const stateSchema = tableSchema.extend({ state: z.enum(["available", "reserved"]) }).strict();

// Never leaks a driver message; a rule the staff can act on is passed through.
function failure(error: unknown): ServiceResult {
  if (error instanceof ServiceError) return { ok: false, error: error.message };
  return { ok: false, error: "We couldn’t update the floor. Please refresh and try again." };
}

export async function joinQueue(input: unknown): Promise<ServiceResult> {
  const data = joinSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Enter a guest name and a party size of 1 to 30." };
  const branch = await requireBranch(data.data.branchId, "queue:manage");
  try {
    await addToQueue(scopeOf(branch), data.data.guestName, data.data.partySize);
    revalidatePath(`/workspace/${branch.id}/service`);
    return { ok: true, message: `${data.data.guestName} is on the waiting list.` };
  } catch (error) { return failure(error); }
}

export async function seatTable(input: unknown): Promise<ServiceResult> {
  const data = seatSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Choose a table to seat this party at." };
  const branch = await requireBranch(data.data.branchId, "queue:manage");
  try {
    const { label } = await seatParty(scopeOf(branch), data.data.tableId, data.data.entryId);
    revalidatePath(`/workspace/${branch.id}/service`);
    return { ok: true, message: `Table ${label} is seated and its bill is open.` };
  } catch (error) { return failure(error); }
}

export async function closeTable(input: unknown): Promise<ServiceResult> {
  const data = tableSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Choose a table to close." };
  const branch = await requireBranch(data.data.branchId, "billing:manage");
  try {
    const { label } = await closeBill(scopeOf(branch), data.data.tableId);
    revalidatePath(`/workspace/${branch.id}/service`);
    return { ok: true, message: `Table ${label} is paid and free again.` };
  } catch (error) { return failure(error); }
}

export async function markTable(input: unknown): Promise<ServiceResult> {
  const data = stateSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Choose a table to update." };
  const branch = await requireBranch(data.data.branchId, "queue:manage");
  try {
    const { label } = await setTableState(scopeOf(branch), data.data.tableId, data.data.state);
    revalidatePath(`/workspace/${branch.id}/service`);
    return { ok: true, message: `Table ${label} is now ${data.data.state}.` };
  } catch (error) { return failure(error); }
}

const advanceSchema = z.object({ branchId: uuid, orderId: uuid, status: z.enum(["preparing", "served", "cancelled"]) }).strict();

export async function advanceTicket(input: unknown): Promise<ServiceResult> {
  const data = advanceSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Choose a ticket to update." };
  const branch = await requireBranch(data.data.branchId, "kitchen:manage");
  try {
    const result = await advanceOrder(scopeOf(branch), data.data.orderId, data.data.status);
    revalidatePath(`/workspace/${branch.id}/kitchen`);
    revalidatePath(`/workspace/${branch.id}/service`);
    // Someone else already moved it; say so rather than claiming a change.
    return { ok: true, message: result.changed ? `Ticket marked ${data.data.status}.` : `That ticket was already ${result.status}.` };
  } catch (error) { return failure(error); }
}
