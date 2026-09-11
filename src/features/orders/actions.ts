"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { cartSchema, formatMoney, OrderRejectedError } from "./model";
import { placeGuestOrder, readGuestTable } from "./repository";

export type OrderResult = { ok: true; message: string } | { ok: false; error: string };

// The guest is unauthenticated, so the table ID from the QR link is the only
// thing they supply beyond the cart, and it is validated as a UUID first.
const schema = z.object({ tableId: z.string().uuid(), cart: cartSchema }).strict();

export async function placeOrder(input: unknown): Promise<OrderResult> {
  const data = schema.safeParse(input);
  if (!data.success) return { ok: false, error: "Please check your order and try again." };
  try {
    const table = await readGuestTable(data.data.tableId);
    if (!table) return { ok: false, error: "We couldn’t find this table. Please ask a member of staff." };
    const { totalCents } = await placeGuestOrder(data.data.tableId, data.data.cart);
    revalidatePath(`/t/${data.data.tableId}`);
    revalidatePath(`/workspace/${table.branchId}/service`);
    return { ok: true, message: `Order sent to the kitchen. Your bill is now ${formatMoney(totalCents, table.currency)}.` };
  } catch (error) {
    if (error instanceof OrderRejectedError) return { ok: false, error: error.message };
    return { ok: false, error: "We couldn’t send your order. Please try again or ask a member of staff." };
  }
}
