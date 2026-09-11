import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/db";
import { branches, branchStaff, diningTables, floors, layoutVersions, memberships } from "@/db/schema";
import { hasPermission, resolveBranchRole } from "@/features/tenancy/permissions";
import { branchLabelConflicts, canvasSchema, checkRevision, FloorValidationError, layoutCollisions, protectedTableChanges, retiredLabel, type FloorCanvas, type FloorSnapshot } from "./model";

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type FloorActor = { userId: string; branchId: string; organizationId: string };

// Lock order for every future branch mutation: branch, membership, assignment,
// floor, tables sorted by ID. Shared membership locks prevent mid-write revocation.
async function lockEditor(tx: Transaction, actor: FloorActor) {
  const [branch] = await tx.select().from(branches).where(and(eq(branches.id, actor.branchId), eq(branches.organizationId, actor.organizationId))).for("update");
  if (!branch) throw new FloorValidationError("This branch is no longer available.");
  const [membership] = await tx.select().from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.userId, actor.userId))).for("share");
  const [assignment] = await tx.select().from(branchStaff).where(and(eq(branchStaff.branchId, actor.branchId), eq(branchStaff.organizationId, actor.organizationId), eq(branchStaff.userId, actor.userId))).for("share");
  const role = resolveBranchRole(actor.userId, branch, membership, assignment);
  if (!role || !hasPermission(role, "floor:edit")) throw new FloorValidationError("Your floor editing access has changed. Ask the restaurant owner for access.");
}

export async function createFloorRecord(actor: FloorActor, name: string) {
  return getDatabase().transaction(async tx => {
    await lockEditor(tx, actor);
    const [floor] = await tx.insert(floors).values({ branchId: actor.branchId, organizationId: actor.organizationId, name }).returning();
    return floor;
  });
}

// Caller verifies branch access before invoking this server-only repository.
export async function readFloorWorkspace(branchId: string, organizationId: string, selectedId?: string) {
  return getDatabase().transaction(async tx => {
    const allFloors = await tx.select().from(floors).where(and(eq(floors.branchId, branchId), eq(floors.organizationId, organizationId))).orderBy(asc(floors.name));
    const selected = selectedId ? allFloors.find(f => f.id === selectedId) : allFloors[0];
    let snapshot: FloorSnapshot | null = null;
    if (selected) {
      const versions = await tx.select().from(layoutVersions).where(and(eq(layoutVersions.floorId, selected.id), eq(layoutVersions.branchId, branchId), eq(layoutVersions.organizationId, organizationId), inArray(layoutVersions.state, ["draft", "published"])));
      const branchTables = await tx.select({ id: diningTables.id, floorId: diningTables.floorId, label: diningTables.label, capacity: diningTables.capacity, accessible: diningTables.accessible, enabled: diningTables.enabled, state: diningTables.state }).from(diningTables).where(and(eq(diningTables.branchId, branchId), eq(diningTables.organizationId, organizationId)));
      const tables = branchTables.filter(table => table.floorId === selected.id);
      const draft = versions.find(v => v.state === "draft"), published = versions.find(v => v.state === "published");
      // Retired tables release their number, so only live ones reserve one.
      snapshot = { id: selected.id, name: selected.name, revision: selected.revision, draft: draft ? canvasSchema.parse(draft.canvas) : null, published: published ? canvasSchema.parse(published.canvas) : null, tables, reservedLabels: branchTables.filter(table => table.enabled).map(table => table.label) };
    }
    return { floors: allFloors.map(f => ({ id: f.id, name: f.name })), snapshot };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function writeFloorPlan(actor: FloorActor, floorId: string, expectedRevision: number, canvas: FloorCanvas, mode: "draft" | "publish") {
  // Validate again at repository boundary. Drafts may overlap while being edited;
  // publishing requires every table footprint to be clear of solid objects.
  const normalized = canvasSchema.parse(canvas);
  if (mode === "publish") {
    const errors = layoutCollisions(normalized);
    if (errors.length) throw new FloorValidationError(errors[0]);
  }
  return getDatabase().transaction(async tx => {
    await lockEditor(tx, actor);
    const floorScope = and(eq(floors.id, floorId), eq(floors.branchId, actor.branchId), eq(floors.organizationId, actor.organizationId));
    const [floor] = await tx.select().from(floors).where(floorScope).for("update");
    if (!floor) throw new FloorValidationError("This floor is no longer available.");
    checkRevision(expectedRevision, floor.revision);
    const versionScope = and(eq(layoutVersions.floorId, floorId), eq(layoutVersions.branchId, actor.branchId), eq(layoutVersions.organizationId, actor.organizationId));
    const [published] = await tx.select().from(layoutVersions).where(and(versionScope, eq(layoutVersions.state, "published")));

    if (mode === "publish") {
      const branchTables = await tx.select().from(diningTables).where(and(eq(diningTables.branchId, actor.branchId), eq(diningTables.organizationId, actor.organizationId))).orderBy(asc(diningTables.id)).for("update");
      const currentTables = branchTables.filter(table => table.floorId === floorId);
      const busyErrors = protectedTableChanges(normalized, published ? canvasSchema.parse(published.canvas) : null, currentTables);
      if (busyErrors.length) throw new FloorValidationError(busyErrors[0]);
      const plannedTables = normalized.objects.filter(object => object.kind === "table");
      const ids = new Set(plannedTables.map(table => table.id));
      // Report a cross-floor number clash plainly instead of letting the branch
      // unique constraint surface as an unexplained save failure.
      const crossFloor = branchLabelConflicts(normalized, branchTables.filter(table => table.floorId !== floorId));
      if (crossFloor.length) throw new FloorValidationError(crossFloor[0]);

      // Move renamed rows through unique temporary labels so two free tables
      // can exchange numbers in one publish. The transaction hides these names.
      for (const table of plannedTables) {
        const existing = currentTables.find(t => t.id === table.id);
        if (existing && existing.label !== table.label) {
          await tx.update(diningTables).set({ label: `__rename_${table.id}` }).where(and(eq(diningTables.id, table.id), eq(diningTables.branchId, actor.branchId), eq(diningTables.organizationId, actor.organizationId)));
        }
      }

      // Retire removed tables before writing the new plan so a number freed in
      // this publish can be reused by another table in the same publish.
      for (const table of currentTables.filter(t => t.enabled && !ids.has(t.id))) {
        await tx.update(diningTables).set({ enabled: false, label: retiredLabel(table.id) }).where(and(eq(diningTables.id, table.id), eq(diningTables.branchId, actor.branchId), eq(diningTables.organizationId, actor.organizationId)));
      }

      for (const table of plannedTables) {
        const existing = branchTables.find(t => t.id === table.id);
        if (existing && existing.floorId !== floorId) throw new FloorValidationError("A table on this plan belongs to another floor.");
        const settings = { label: table.label, capacity: table.capacity, accessible: table.accessible, enabled: true };
        if (existing) {
          // Never accept the live state from the client. Preserve existing state.
          await tx.update(diningTables).set(settings).where(and(eq(diningTables.id, table.id), eq(diningTables.branchId, actor.branchId), eq(diningTables.organizationId, actor.organizationId), eq(diningTables.floorId, floorId)));
        } else {
          // A foreign tenant's UUID conflicts rather than updating its record.
          await tx.insert(diningTables).values({ ...settings, id: table.id, floorId, branchId: actor.branchId, organizationId: actor.organizationId });
        }
      }
      await tx.update(layoutVersions).set({ state: "archived" }).where(and(versionScope, inArray(layoutVersions.state, ["draft", "published"])));
    } else {
      await tx.update(layoutVersions).set({ state: "archived" }).where(and(versionScope, eq(layoutVersions.state, "draft")));
    }
    const revision = floor.revision + 1;
    await tx.insert(layoutVersions).values({ floorId, branchId: actor.branchId, organizationId: actor.organizationId, version: revision, state: mode === "publish" ? "published" : "draft", canvas: normalized });
    await tx.update(floors).set({ revision }).where(floorScope);
    return { floorId, revision };
  });
}
