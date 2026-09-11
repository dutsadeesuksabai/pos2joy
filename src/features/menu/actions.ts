"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBranch } from "@/features/tenancy/queries";
import { createMenuItem, duplicateMenu, MenuError, removeMenuItem, updateMenuItem } from "./repository";

export type MenuResult = { ok: true; message: string } | { ok: false; error: string };

const uuid = z.string().uuid();
// Prices arrive as major units from the form and are stored as minor units.
const itemSchema = z.object({
  branchId: uuid,
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  kind: z.enum(["a_la_carte", "buffet"]),
  price: z.number().finite().min(0).max(1000000),
  available: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
}).strict();
const patchSchema = itemSchema.partial({ name: true, category: true, kind: true, price: true, available: true, sortOrder: true })
  .extend({ branchId: uuid, id: uuid }).strict();
const removeSchema = z.object({ branchId: uuid, id: uuid }).strict();
const copySchema = z.object({ branchId: uuid, sourceBranchId: uuid }).strict();

function failure(error: unknown): MenuResult {
  if (error instanceof MenuError) return { ok: false, error: error.message };
  return { ok: false, error: "Couldn’t save the menu. Refresh and try again." };
}
const scopeOf = (branch: { id: string; organizationId: string }) => ({ branchId: branch.id, organizationId: branch.organizationId });
const toCents = (price: number) => Math.round(price * 100);

export async function addMenuItem(input: unknown): Promise<MenuResult> {
  const data = itemSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Enter a name, a group and a price." };
  const branch = await requireBranch(data.data.branchId, "menu:manage");
  try {
    const { branchId: _b, price, ...rest } = data.data;
    await createMenuItem(scopeOf(branch), { ...rest, priceCents: toCents(price) });
    revalidatePath(`/workspace/${branch.id}/menu`);
    return { ok: true, message: `${data.data.name} added.` };
  } catch (error) { return failure(error); }
}

export async function editMenuItem(input: unknown): Promise<MenuResult> {
  const data = patchSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Check the dish details." };
  const branch = await requireBranch(data.data.branchId, "menu:manage");
  try {
    const { branchId: _b, id, price, ...rest } = data.data;
    await updateMenuItem(scopeOf(branch), id, { ...rest, ...(price === undefined ? {} : { priceCents: toCents(price) }) });
    revalidatePath(`/workspace/${branch.id}/menu`);
    return { ok: true, message: "Saved." };
  } catch (error) { return failure(error); }
}

export async function deleteMenuItem(input: unknown): Promise<MenuResult> {
  const data = removeSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Choose a dish to remove." };
  const branch = await requireBranch(data.data.branchId, "menu:manage");
  try {
    const { retired, name } = await removeMenuItem(scopeOf(branch), data.data.id);
    revalidatePath(`/workspace/${branch.id}/menu`);
    // Say which happened, because a retired dish still shows on old bills.
    return { ok: true, message: retired ? `${name} hidden. It stays on past bills.` : `${name} removed.` };
  } catch (error) { return failure(error); }
}

export async function copyMenuFrom(input: unknown): Promise<MenuResult> {
  const data = copySchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Choose a branch to copy from." };
  const branch = await requireBranch(data.data.branchId, "menu:manage");
  try {
    const { copied, skipped } = await duplicateMenu(scopeOf(branch), data.data.sourceBranchId);
    revalidatePath(`/workspace/${branch.id}/menu`);
    return { ok: true, message: skipped ? `${copied} copied, ${skipped} already here.` : `${copied} dishes copied.` };
  } catch (error) { return failure(error); }
}
