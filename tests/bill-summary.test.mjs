import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBills } from "../src/features/service/bill-summary.ts";

const row = (extra = {}) => ({ id: "bill-a", tableId: "table-a", status: "placed", createdAt: new Date(1000), name: "Tea", quantity: 2, unitPriceCents: 1250, ...extra });
test("one-pass bill summary preserves amounts, detail and empty bills", () => {
  const result = summarizeBills([row(), row({ name: "Cake", quantity: 3, unitPriceCents: 199 }), row({ id: "empty", tableId: "table-b", createdAt: new Date(2000), name: null, quantity: null, unitPriceCents: null })]);
  assert.equal(result.bills.length, 2);
  assert.deepEqual(result.bills.map(b => [b.id, b.totalCents, b.lines]), [["empty", 0, 0], ["bill-a", 3097, 2]]);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].unitPriceCents, 1250);
});
test("separate orders on the same table keep their identities and status", () => {
  const result = summarizeBills([row(), row({ id: "older", status: "served", createdAt: new Date(0), quantity: 5 })]);
  assert.equal(result.bills.length, 2);
  assert.deepEqual(result.bills.map(b => [b.id, b.status, b.totalCents]), [["bill-a", "placed", 2500], ["older", "served", 6250]]);
  assert.equal(result.items.length, 2);
});
test("zero-priced dishes are real lines and an empty result stays empty", () => {
  assert.equal(summarizeBills([row({ unitPriceCents: 0 })]).bills[0].lines, 1);
  assert.deepEqual(summarizeBills([]), { bills: [], items: [] });
});
test("totals agree with independent grouping over mixed historical and live bills", () => {
  const rows = Array.from({ length: 1000 }, (_, i) => row({ id: `bill-${i % 37}`, tableId: `table-${i % 37}`, quantity: i % 5 + 1, unitPriceCents: 101 + i, createdAt: new Date(i % 37) }));
  const result = summarizeBills(rows);
  for (const bill of result.bills) {
    const lines = rows.filter(r => r.id === bill.id);
    assert.equal(bill.totalCents, lines.reduce((total, r) => total + r.quantity * r.unitPriceCents, 0));
    assert.equal(bill.lines, lines.length);
  }
  assert.equal(result.items.length, rows.length);
});
