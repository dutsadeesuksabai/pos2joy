import { z } from "zod";

// A guest scans the QR on their table, so the only thing the client sends is a
// cart. The table comes from the URL and the prices come from the database;
// never trust a price, a name, or a table state from the request body.
export const cartSchema = z.object({
  items: z.array(z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(50),
}).strict().superRefine((cart, ctx) => {
  const seen = new Set<string>();
  cart.items.forEach((item, i) => {
    if (seen.has(item.menuItemId)) ctx.addIssue({ code: "custom", path: ["items", i], message: "Each dish should appear once with its quantity." });
    seen.add(item.menuItemId);
  });
});
export type Cart = z.infer<typeof cartSchema>;

export type OrderableTable = { enabled: boolean; state: "available" | "occupied" | "reserved" | "held" };
export type MenuItem = { id: string; name: string; priceCents: number; available: boolean };

// ponytail: seating is the session. A QR code photographed at the door orders
// nothing until staff seat that table, so no separate token table or expiry job.
// Swap in per-visit tokens if guests ever need to order before being seated.
export function tableOrderingError(table: OrderableTable | undefined) {
  if (!table || !table.enabled) return "This table isn’t taking orders. Please ask a member of staff.";
  if (table.state !== "occupied") return "Please ask a member of staff to seat you, then scan again.";
  return null;
}

export class OrderRejectedError extends Error {}

// Returns the lines to persist, priced from the menu rows the caller just read.
export function priceCart(cart: Cart, menu: MenuItem[]) {
  return cart.items.map(line => {
    const item = menu.find(entry => entry.id === line.menuItemId);
    if (!item) throw new OrderRejectedError("Something on your order is no longer on the menu. Please review your cart.");
    if (!item.available) throw new OrderRejectedError(`${item.name} has just sold out. Please remove it and try again.`);
    return { menuItemId: item.id, name: item.name, unitPriceCents: item.priceCents, quantity: line.quantity };
  });
}

export const orderTotalCents = (lines: { unitPriceCents: number; quantity: number }[]) =>
  lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);

export const formatMoney = (cents: number, currency: string, locale = "en") =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);

export const orderStatuses = ["placed", "preparing", "served", "cancelled"] as const;
export type OrderStatus = typeof orderStatuses[number];

// A ticket moves forward, or is cancelled while nothing has been cooked yet.
// Re-sending the status a board already shows is a no-op rather than an error,
// because two people tapping the same ticket is normal in a kitchen.
const forward: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ["preparing", "served", "cancelled"],
  preparing: ["served", "cancelled"],
  served: [],
  cancelled: [],
};

export function canAdvanceOrder(current: string, next: OrderStatus) {
  if (current === next) return "unchanged" as const;
  if (!orderStatuses.includes(current as OrderStatus)) return false;
  return forward[current as OrderStatus].includes(next);
}
