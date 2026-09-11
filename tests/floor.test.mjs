import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { canvasSchema, layoutCollisions, protectedTableChanges, branchLabelConflicts, objectBounds, resizeBounds, checkRevision, FloorConflictError } from "../src/features/floor/model.ts";

const table = (extra = {}) => ({ id: randomUUID(), kind: "table", label: "01", capacity: 4, shape: "rectangle", accessible: false, x: 50, y: 50, width: 100, height: 80, rotation: 0, ...extra });
const canvas = (...objects) => ({ width: 1000, height: 700, objects });
const block = (kind = "wall", extra = {}) => ({ id: randomUUID(), kind, label: kind, x: 80, y: 80, width: 200, height: 40, rotation: 0, ...extra });
test("blank rooms are valid and table labels are normalized", () => { assert.equal(canvasSchema.safeParse(canvas()).success, true); assert.equal(canvasSchema.parse(canvas(table({ label: " a1 " }))).objects[0].label, "A1"); });
test("rejects duplicate table labels ignoring case and surrounding whitespace", () => assert.equal(canvasSchema.safeParse(canvas(table({ label: "a" }), table({ label: " A ", x: 300 }))).success, false));
test("rejects duplicate IDs across different kinds", () => { const t = table(); assert.equal(canvasSchema.safeParse(canvas(t, block("zone", { id: t.id }))).success, false); });
test("rotation is included in boundary checks", () => { const t = table({ x: 0, y: 0, width: 200, height: 50, rotation: 90 }); assert.deepEqual(objectBounds(t), { x: 75, y: -75, width: 50, height: 200 }); assert.equal(canvasSchema.safeParse(canvas(t)).success, false); });
test("rejects off-room objects, non-finite values, oversized payloads and invalid capacities", () => { for (const patch of [{ x: -1 }, { x: 950 }, { x: NaN }, { capacity: 0 }, { capacity: 2.5 }, { capacity: 31 }, { rotation: 45 }]) assert.equal(canvasSchema.safeParse(canvas(table(patch))).success, false); assert.equal(canvasSchema.safeParse(canvas(...Array.from({ length: 201 }, (_, i) => table({ label: String(i) })))).success, false); });
test("client live states and unknown properties are rejected", () => assert.equal(canvasSchema.safeParse(canvas(table({ state: "available" }))).success, false));
test("overlapping tables and solid blocks prevent publishing", () => { assert.equal(layoutCollisions(canvas(table(), table({ label: "02", x: 100 }))).length, 1); for (const kind of ["wall", "counter", "entrance"]) assert.equal(layoutCollisions(canvas(table(), block(kind))).length, 1); });
test("zones may overlap tables; walls may intersect; touching edges are allowed", () => { assert.equal(layoutCollisions(canvas(table(), block("zone"))).length, 0); assert.equal(layoutCollisions(canvas(block(), block())).length, 0); assert.equal(layoutCollisions(canvas(table(), table({ label: "02", x: 150 }))).length, 0); });
test("rotated block collision uses its rotated footprint", () => { const t = table({ x: 300, y: 90 }); assert.equal(layoutCollisions(canvas(t, block("wall", { x: 250, y: 200, width: 200, height: 40, rotation: 90 }))).length, 1); });
test("busy tables cannot be removed, moved, resized, renamed, or have seating changed", () => { const t = table(); for (const state of ["occupied", "reserved", "held"]) { const live = [{ ...t, state, enabled: true }]; assert.equal(protectedTableChanges(canvas(), canvas(t), live).length, 1); for (const patch of [{ x: 70 }, { y: 70 }, { label: "03" }, { capacity: 2 }, { accessible: true }, { width: 150 }, { height: 100 }, { rotation: 90 }, { shape: "round" }]) assert.equal(protectedTableChanges(canvas({ ...t, ...patch }), canvas(t), live).length, 1); } });
test("unchanged busy tables remain publishable and free tables may move", () => { const t = table(); assert.deepEqual(protectedTableChanges(canvas(t), canvas(t), [{ ...t, enabled: true, state: "occupied" }]), []); assert.deepEqual(protectedTableChanges(canvas({ ...t, x: 400 }), canvas(t), [{ ...t, enabled: true, state: "available" }]), []); });
test("unrepresented busy table blocks publication rather than disappearing", () => { const t = table(); assert.equal(protectedTableChanges(canvas(), null, [{ ...t, enabled: true, state: "held" }]).length, 1); });
test("stale editors cannot save over a newer revision", () => { assert.doesNotThrow(() => checkRevision(4, 4)); assert.throws(() => checkRevision(4, 5), FloorConflictError); });
test("a table number live on another floor blocks publishing; a retired one is free to reuse", () => {
  const other = { label: "01", enabled: true };
  assert.equal(branchLabelConflicts(canvas(table({ label: "01" })), [other]).length, 1);
  assert.deepEqual(branchLabelConflicts(canvas(table({ label: "01" })), [{ ...other, enabled: false }]), []);
  assert.deepEqual(branchLabelConflicts(canvas(table({ label: "02" })), [other]), []);
  assert.deepEqual(branchLabelConflicts(canvas(block("wall", { label: "01" })), [other]), []);
});
const room = { width: 1000, height: 700 };
const start = { x: 100, y: 100, width: 200, height: 150 };
test("dragging a south-east handle grows width and height, snapped to the grid", () => {
  assert.deepEqual(resizeBounds(start, "se", 44, 63, room), { x: 100, y: 100, width: 240, height: 210 });
});
test("dragging a north-west handle moves the corner and keeps the opposite edge still", () => {
  const next = resizeBounds(start, "nw", -50, -30, room);
  assert.deepEqual(next, { x: 50, y: 70, width: 250, height: 180 });
  assert.equal(next.x + next.width, start.x + start.width);
  assert.equal(next.y + next.height, start.y + start.height);
});
test("a shrinking edge stops at the minimum instead of inverting", () => {
  for (const corner of ["nw", "ne", "sw", "se"]) {
    const next = resizeBounds(start, corner, corner.includes("w") ? 9999 : -9999, corner.includes("n") ? 9999 : -9999, room);
    assert.equal(next.width, 20, corner); assert.equal(next.height, 20, corner);
    assert.ok(next.x >= 0 && next.y >= 0, corner);
  }
});
test("a resize never leaves the room", () => {
  for (const [corner, dx, dy] of [["se", 9999, 9999], ["nw", -9999, -9999], ["ne", 9999, -9999], ["sw", -9999, 9999]]) {
    const next = resizeBounds(start, corner, dx, dy, room);
    assert.ok(next.x >= 0 && next.y >= 0, corner);
    assert.ok(next.x + next.width <= room.width, `${corner} width`);
    assert.ok(next.y + next.height <= room.height, `${corner} height`);
  }
});
test("a resized zone still satisfies the canvas schema", () => {
  const zone = block("zone", { x: 100, y: 100, width: 200, height: 150 });
  const grown = { ...zone, ...resizeBounds(zone, "se", 300, 200, room) };
  assert.equal(canvasSchema.safeParse(canvas(grown)).success, true);
});
