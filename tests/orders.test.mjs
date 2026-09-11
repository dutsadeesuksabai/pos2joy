import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cartSchema, tableOrderingError, priceCart, orderTotalCents, canAdvanceOrder, OrderRejectedError } from "../src/features/orders/model.ts";

const padThai = { id: randomUUID(), name: "Pad Thai", priceCents: 18000, available: true };
const tea = { id: randomUUID(), name: "Iced Tea", priceCents: 6050, available: true };
const menu = [padThai, tea];
const cart = (...items) => ({ items });

test("a cart must be a non-empty list of whole positive quantities", () => {
  assert.equal(cartSchema.safeParse(cart()).success, false);
  for (const quantity of [0, -1, 2.5, 100, NaN]) assert.equal(cartSchema.safeParse(cart({ menuItemId: padThai.id, quantity })).success, false);
  assert.equal(cartSchema.safeParse(cart({ menuItemId: "not-a-uuid", quantity: 1 })).success, false);
  assert.equal(cartSchema.safeParse(cart({ menuItemId: padThai.id, quantity: 2 })).success, true);
});

test("a cart rejects prices, names, and other smuggled fields", () => {
  assert.equal(cartSchema.safeParse(cart({ menuItemId: padThai.id, quantity: 1, unitPriceCents: 1 })).success, false);
  assert.equal(cartSchema.safeParse({ items: [{ menuItemId: padThai.id, quantity: 1 }], tableId: randomUUID() }).success, false);
});

test("the same dish cannot appear on two lines", () =>
  assert.equal(cartSchema.safeParse(cart({ menuItemId: padThai.id, quantity: 1 }, { menuItemId: padThai.id, quantity: 2 })).success, false));

test("only a seated, enabled table takes orders", () => {
  assert.equal(tableOrderingError({ enabled: true, state: "occupied" }), null);
  for (const state of ["available", "reserved", "held"]) assert.notEqual(tableOrderingError({ enabled: true, state }), null);
  assert.notEqual(tableOrderingError({ enabled: false, state: "occupied" }), null);
  assert.notEqual(tableOrderingError(undefined), null);
});

test("lines are priced from the menu, never from the cart", () => {
  const lines = priceCart(cart({ menuItemId: padThai.id, quantity: 3 }, { menuItemId: tea.id, quantity: 2 }), menu);
  assert.deepEqual(lines.map(line => line.unitPriceCents), [18000, 6050]);
  assert.equal(orderTotalCents(lines), 18000 * 3 + 6050 * 2);
});

test("a removed or sold-out dish rejects the whole order", () => {
  assert.throws(() => priceCart(cart({ menuItemId: randomUUID(), quantity: 1 }), menu), OrderRejectedError);
  assert.throws(() => priceCart(cart({ menuItemId: tea.id, quantity: 1 }), [padThai, { ...tea, available: false }]), OrderRejectedError);
});

test("totals stay exact in minor units", () => assert.equal(orderTotalCents([{ unitPriceCents: 1010, quantity: 3 }]), 3030));

test("a ticket only moves forward", () => {
  assert.equal(canAdvanceOrder("placed", "preparing"), true);
  assert.equal(canAdvanceOrder("placed", "served"), true);
  assert.equal(canAdvanceOrder("preparing", "served"), true);
  assert.equal(canAdvanceOrder("preparing", "placed"), false);
  assert.equal(canAdvanceOrder("served", "preparing"), false);
  assert.equal(canAdvanceOrder("served", "placed"), false);
});

test("a finished ticket cannot be cancelled, an unstarted one can", () => {
  assert.equal(canAdvanceOrder("placed", "cancelled"), true);
  assert.equal(canAdvanceOrder("preparing", "cancelled"), true);
  assert.equal(canAdvanceOrder("served", "cancelled"), false);
  assert.equal(canAdvanceOrder("cancelled", "served"), false);
});

test("re-tapping the status a board already shows is a no-op, junk is refused", () => {
  for (const status of ["placed", "preparing", "served"]) assert.equal(canAdvanceOrder(status, status), "unchanged");
  assert.equal(canAdvanceOrder("paid", "served"), false);
  assert.equal(canAdvanceOrder("", "served"), false);
});
