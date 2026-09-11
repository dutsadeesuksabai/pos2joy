"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBranch } from "@/features/tenancy/queries";
import { requireUser } from "@/features/tenancy/session";
import { canvasSchema, FloorConflictError, FloorValidationError, type FloorActionResult } from "./model";
import { createFloorRecord, writeFloorPlan } from "./repository";

const writeSchema = z.object({ branchId: z.string().uuid(), floorId: z.string().uuid(), expectedRevision: z.number().int().min(0).max(2147483646), canvas: canvasSchema, mode: z.enum(["draft", "publish"]) }).strict();
const createSchema = z.object({ branchId: z.string().uuid(), name: z.string().trim().min(1).max(50) }).strict();

function failure(error: unknown): FloorActionResult {
  if (error instanceof FloorConflictError) return { ok: false, error: error.message, conflict: true };
  if (error instanceof FloorValidationError) return { ok: false, error: error.message };
  // No provider error details or connection strings are returned to clients.
  return { ok: false, error: "We couldn’t save this floor. Check that floor names and table numbers are unique, then try again. If this continues, contact your administrator." };
}

export async function createFloor(input: unknown): Promise<FloorActionResult> {
  const data = createSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Enter a floor name of 1–50 characters." };
  const user = await requireUser();
  const branch = await requireBranch(data.data.branchId, "floor:edit");
  try {
    const floor = await createFloorRecord({ userId: user.id, branchId: branch.id, organizationId: branch.organizationId }, data.data.name);
    revalidatePath(`/workspace/${branch.id}/floor`);
    return { ok: true, floorId: floor.id, revision: floor.revision, message: "Your new floor is ready." };
  } catch (error) { return failure(error); }
}

export async function saveFloor(input: unknown): Promise<FloorActionResult> {
  const data = writeSchema.safeParse(input);
  if (!data.success) return { ok: false, error: data.error.issues[0]?.message ?? "Check the layout settings." };
  const user = await requireUser();
  const branch = await requireBranch(data.data.branchId, "floor:edit");
  try {
    const result = await writeFloorPlan({ userId: user.id, branchId: branch.id, organizationId: branch.organizationId }, data.data.floorId, data.data.expectedRevision, data.data.canvas, data.data.mode);
    revalidatePath(`/workspace/${branch.id}/floor`);
    return { ok: true, ...result, message: data.data.mode === "publish" ? "Layout published. Your service floor is up to date." : "Draft saved. Your published floor is unchanged." };
  } catch (error) { return failure(error); }
}
