import test from "node:test";
import assert from "node:assert/strict";
import { canSeat, planSeating } from "../src/features/queue/recommend.ts";

const now = 1800000000000;
const table = (id, capacity, extra = {}) => ({ id, label: id, capacity, floorId: "main", accessible: false, status: "available", x: 0, y: 0, ...extra });
const party = (id, size, minutes, extra = {}) => ({ id, name: id, size, joinedAt: now - minutes * 60000, status: "waiting", ...extra });
const pairs = plan => Object.fromEntries(plan.map(p => [p.party.id, p.table.id]));

test("seats a small party without consuming the only table for eight", () => {
  assert.deepEqual(pairs(planSeating([table("eight", 8), table("two", 2)], [party("small", 2, 40), party("large", 8, 5)], now)), { small: "two", large: "eight" });
});
test("rematches an earlier party to preserve accessible seating", () => {
  const tables = [table("accessible", 2, { accessible: true }), table("regular", 4)];
  assert.deepEqual(pairs(planSeating(tables, [party("first", 2, 40), party("access", 2, 5, { needsAccessible: true })], now)), { first: "regular", access: "accessible" });
});
test("requested area is a hard constraint", () => {
  const p = party("patio", 2, 40, { requestedFloorId: "patio" });
  assert.equal(canSeat(table("main", 4), p), false);
  assert.deepEqual(pairs(planSeating([table("main", 4), table("outside", 4, { floorId: "patio" })], [p], now)), { patio: "outside" });
});
test("oldest overdue party keeps the only eligible table", () => {
  assert.equal(planSeating([table("four", 4)], [party("fit", 4, 31), party("oldest", 2, 35)], now)[0].party.id, "oldest");
});
test("excludes unavailable tables and already called parties", () => {
  assert.deepEqual(planSeating([table("held", 4, { status: "reserved" }), table("free", 4)], [party("called", 2, 40, { status: "offered" }), party("large", 8, 50)], now), []);
});
test("input ordering cannot change the seating plan", () => {
  const tables = [table("b", 4), table("a", 4)];
  const parties = [party("second", 2, 5), party("first", 2, 5)];
  assert.deepEqual(planSeating(tables, parties, now), planSeating([...tables].reverse(), [...parties].reverse(), now));
});
test("rejects ambiguous identities and invalid clock or policy", () => {
  const t = table("one", 2), p = party("one", 2, 5);
  assert.throws(() => planSeating([t, t], [p], now));
  assert.throws(() => planSeating([t], [p, p], now));
  assert.throws(() => planSeating([t], [p], NaN));
  assert.throws(() => planSeating([t], [p], now, { maxWaitMinutes: 30, fitWeight: -1 }));
});

// Exhaustive reference search checks maximum party count independently of the
// augmenting-path implementation, across deterministic mixed room constraints.
function maximumCount(tables, parties, index = 0, used = new Set()) {
  if (index === parties.length) return 0;
  let best = maximumCount(tables, parties, index + 1, used);
  for (const t of tables) {
    if (used.has(t.id) || !canSeat(t, parties[index])) continue;
    best = Math.max(best, 1 + maximumCount(tables, parties, index + 1, new Set([...used, t.id])));
  }
  return best;
}
test("matches maximum feasible party count in 200 mixed room scenarios", () => {
  let seed = 73421;
  const next = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let scenario = 0; scenario < 200; scenario++) {
    const tables = Array.from({ length: 4 }, (_, i) => table(`t${i}`, [2, 4, 8][next(3)], { accessible: next(3) === 0, floorId: ["main", "patio"][next(2)], status: next(5) === 0 ? "reserved" : "available" }));
    const parties = Array.from({ length: 5 }, (_, i) => party(`p${i}`, [1, 2, 4, 8][next(4)], next(50), { needsAccessible: next(4) === 0, requestedFloorId: [null, "main", "patio"][next(3)] }));
    const plan = planSeating(tables, parties, now);
    assert.equal(plan.length, maximumCount(tables, parties), `scenario ${scenario}`);
    assert.equal(new Set(plan.map(p => p.table.id)).size, plan.length);
    assert.equal(new Set(plan.map(p => p.party.id)).size, plan.length);
    assert.ok(plan.every(p => canSeat(p.table, p.party)));
  }
});
