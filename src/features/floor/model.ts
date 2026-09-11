import { z } from "zod";

const geometry = {
  id: z.string().uuid(), label: z.string().trim().min(1).max(30),
  x: z.number().finite().min(0).max(5000), y: z.number().finite().min(0).max(5000),
  width: z.number().finite().min(20).max(5000), height: z.number().finite().min(20).max(5000),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
};
export const floorObjectSchema = z.discriminatedUnion("kind", [
  z.object({ ...geometry, kind: z.literal("table"), label: z.string().trim().min(1).max(12).transform(s => s.toUpperCase()), capacity: z.number().int().min(1).max(30), shape: z.enum(["rectangle", "round"]), accessible: z.boolean() }).strict(),
  z.object({ ...geometry, kind: z.enum(["wall", "counter", "entrance", "zone"]) }).strict(),
]);
export const canvasSchema = z.object({
  width: z.number().int().min(400).max(5000), height: z.number().int().min(400).max(5000),
  objects: z.array(floorObjectSchema).max(200),
}).strict().superRefine((canvas, ctx) => {
  const ids = new Set<string>(), labels = new Set<string>();
  canvas.objects.forEach((object, i) => {
    if (ids.has(object.id)) ctx.addIssue({ code: "custom", path: ["objects", i], message: "Every object needs a unique ID." });
    ids.add(object.id);
    if (object.kind === "table") {
      if (labels.has(object.label)) ctx.addIssue({ code: "custom", path: ["objects", i, "label"], message: "Table numbers must be unique." });
      labels.add(object.label);
    }
    const bounds = objectBounds(object);
    if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > canvas.width || bounds.y + bounds.height > canvas.height) {
      ctx.addIssue({ code: "custom", path: ["objects", i], message: `${object.label} must stay inside the room.` });
    }
  });
});
export type FloorCanvas = z.infer<typeof canvasSchema>;
export type FloorObject = z.infer<typeof floorObjectSchema>;
export type FloorTable = Extract<FloorObject, { kind: "table" }>;
export type TableState = "available" | "occupied" | "reserved" | "held";
export type LiveTable = { id: string; label: string; capacity: number; accessible: boolean; enabled: boolean; state: TableState };
export const blankCanvas = (): FloorCanvas => ({ width: 1000, height: 700, objects: [] });

export function objectBounds(object: { x: number; y: number; width: number; height: number; rotation: number }) {
  const swapped = object.rotation === 90 || object.rotation === 270;
  const width = swapped ? object.height : object.width, height = swapped ? object.width : object.height;
  return { x: object.x + (object.width - width) / 2, y: object.y + (object.height - height) / 2, width, height };
}
export function overlaps(a: ReturnType<typeof objectBounds>, b: ReturnType<typeof objectBounds>) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
// Corner-handle resize. A shrinking edge stops at the minimum instead of
// dragging through its anchor, and the result always lands inside the room.
export function resizeBounds(
  start: { x: number; y: number; width: number; height: number },
  corner: string, dx: number, dy: number, room: { width: number; height: number },
) {
  const snap = (value: number) => Math.round(value / 10) * 10;
  let { x, y, width, height } = start;
  if (corner.includes("e")) width = start.width + dx;
  if (corner.includes("s")) height = start.height + dy;
  if (corner.includes("w")) { x = start.x + dx; width = start.width - dx; }
  if (corner.includes("n")) { y = start.y + dy; height = start.height - dy; }
  [x, y, width, height] = [snap(x), snap(y), snap(width), snap(height)];
  if (width < 20) { if (corner.includes("w")) x = start.x + start.width - 20; width = 20; }
  if (height < 20) { if (corner.includes("n")) y = start.y + start.height - 20; height = 20; }
  if (x < 0) { width += x; x = 0; }
  if (y < 0) { height += y; y = 0; }
  x = Math.min(x, room.width - 20); y = Math.min(y, room.height - 20);
  width = Math.max(20, Math.min(width, room.width - x));
  height = Math.max(20, Math.min(height, room.height - y));
  return { x, y, width, height };
}

export function layoutCollisions(canvas: FloorCanvas): string[] {
  const errors: string[] = [];
  for (let i = 0; i < canvas.objects.length; i++) {
    const a = canvas.objects[i];
    for (const b of canvas.objects.slice(i + 1)) {
      if (a.kind === "zone" || b.kind === "zone" || (a.kind !== "table" && b.kind !== "table")) continue;
      if (overlaps(objectBounds(a), objectBounds(b))) errors.push(`${a.label} overlaps ${b.label}.`);
    }
  }
  return errors;
}
export function protectedTableChanges(next: FloorCanvas, published: FloorCanvas | null, liveTables: LiveTable[]) {
  const errors: string[] = [];
  for (const live of liveTables.filter(t => t.enabled && t.state !== "available")) {
    const before = published?.objects.find(o => o.kind === "table" && o.id === live.id);
    const after = next.objects.find(o => o.kind === "table" && o.id === live.id);
    if (!before || !after || before.kind !== "table" || after.kind !== "table" ||
      before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height || before.rotation !== after.rotation || before.shape !== after.shape ||
      after.label !== live.label || after.capacity !== live.capacity || after.accessible !== live.accessible) errors.push(`Table ${live.label} is ${live.state}; keep its position and settings unchanged.`);
  }
  return errors;
}
// Table numbers are unique per branch, not per floor, because a QR code resolves
// a guest to one label. Retired tables keep their row but release their number.
export function branchLabelConflicts(next: FloorCanvas, otherFloorTables: { label: string; enabled: boolean }[]) {
  const taken = new Set(otherFloorTables.filter(table => table.enabled).map(table => table.label));
  return next.objects.flatMap(object =>
    object.kind === "table" && taken.has(object.label) ? [`Table ${object.label} is already used on another floor in this branch. Give it a different number.`] : []);
}
export const retiredLabel = (id: string) => `__retired_${id}`;

export function checkRevision(expected: number, actual: number) {
  if (expected !== actual) throw new FloorConflictError();
}
export class FloorConflictError extends Error { constructor() { super("Someone else saved this floor. Reload the latest layout before saving again."); } }
export class FloorValidationError extends Error {}

export type FloorSnapshot = {
  id: string; name: string; revision: number;
  draft: FloorCanvas | null; published: FloorCanvas | null; tables: LiveTable[];
  reservedLabels: string[];
};
export type FloorActionResult = { ok: true; floorId: string; revision: number; message: string } | { ok: false; error: string; conflict?: boolean };
