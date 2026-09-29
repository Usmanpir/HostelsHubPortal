"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type { TenantContext } from "@/lib/tenant/context";
import { termsFor, type Terms } from "@/lib/terms";
import type { BedInput, BedUpdateInput, BulkRoomsInput, FloorInput, HostelInput, RoomInput } from "@/lib/validation/property";
import { archiveHostel, createHostel, restoreHostel, updateHostel } from "@/services/hostel/hostel-service";
import {
  archiveBed,
  archiveFloor,
  archiveRoom,
  bulkCreateRooms,
  createBed,
  createFloor,
  createRoom,
  listAvailableBeds,
  updateBed,
  updateFloor,
  updateRoom,
} from "@/services/hostel/structure-service";

// Server actions are thin: resolve the tenant from the session, call the
// service (which validates + authorizes), revalidate affected views.

/** runAction with a success message in the organization's vocabulary (Hostel vs Property). */
async function runWithTerms<T>(fn: (ctx: TenantContext) => Promise<T>, message: (t: Terms) => string) {
  let terms: Terms | null = null;
  const result = await runAction(async () => {
    const ctx = await tenantOrThrow();
    terms = termsFor(ctx.organization.businessType);
    return fn(ctx);
  });
  return result.ok && terms ? { ...result, message: message(terms) } : result;
}

export async function createHostelAction(input: HostelInput) {
  return runWithTerms(async (ctx) => {
    const hostel = await createHostel(ctx, input);
    revalidatePath("/hostels");
    return { id: hostel.id };
  }, (t) => `${t.property} created`);
}

export async function updateHostelAction(id: string, input: HostelInput) {
  return runWithTerms(async (ctx) => {
    await updateHostel(ctx, id, input);
    revalidatePath("/hostels");
    revalidatePath(`/hostels/${id}`);
    return { id };
  }, (t) => `${t.property} updated`);
}

export async function archiveHostelAction(id: string) {
  return runWithTerms(async (ctx) => {
    await archiveHostel(ctx, id);
    revalidatePath("/hostels");
    return null;
  }, (t) => `${t.property} archived`);
}

export async function restoreHostelAction(id: string) {
  return runWithTerms(async (ctx) => {
    await restoreHostel(ctx, id);
    revalidatePath("/hostels");
    return null;
  }, (t) => `${t.property} restored`);
}

export async function createFloorAction(input: FloorInput) {
  return runAction(async () => {
    const floor = await createFloor(await tenantOrThrow(), input);
    revalidatePath("/hostels", "layout");
    return { id: floor.id };
  }, "Floor added");
}

export async function updateFloorAction(id: string, input: FloorInput) {
  return runAction(async () => {
    await updateFloor(await tenantOrThrow(), id, input);
    revalidatePath("/hostels", "layout");
    return { id };
  }, "Floor updated");
}

export async function archiveFloorAction(id: string) {
  return runAction(async () => {
    await archiveFloor(await tenantOrThrow(), id);
    revalidatePath("/hostels", "layout");
    return null;
  }, "Floor removed");
}

export async function createRoomAction(input: RoomInput) {
  return runWithTerms(async (ctx) => {
    const room = await createRoom(ctx, input);
    revalidatePath("/hostels", "layout");
    return { id: room.id };
  }, (t) => `${t.unit} created`);
}

export async function bulkCreateRoomsAction(input: BulkRoomsInput) {
  return runAction(async () => {
    const result = await bulkCreateRooms(await tenantOrThrow(), input);
    revalidatePath("/hostels", "layout");
    return result;
  });
}

export async function updateRoomAction(id: string, input: RoomInput) {
  return runWithTerms(async (ctx) => {
    await updateRoom(ctx, id, input);
    revalidatePath("/hostels", "layout");
    return { id };
  }, (t) => `${t.unit} updated`);
}

export async function archiveRoomAction(id: string) {
  return runWithTerms(async (ctx) => {
    await archiveRoom(ctx, id);
    revalidatePath("/hostels", "layout");
    return null;
  }, (t) => `${t.unit} archived`);
}

export async function createBedAction(input: BedInput) {
  return runAction(async () => {
    const bed = await createBed(await tenantOrThrow(), input);
    revalidatePath("/hostels", "layout");
    return { id: bed.id };
  }, "Bed added");
}

export async function updateBedAction(id: string, input: BedUpdateInput) {
  return runAction(async () => {
    await updateBed(await tenantOrThrow(), id, input);
    revalidatePath("/hostels", "layout");
    return { id };
  }, "Bed updated");
}

export async function archiveBedAction(id: string) {
  return runAction(async () => {
    await archiveBed(await tenantOrThrow(), id);
    revalidatePath("/hostels", "layout");
    return null;
  }, "Bed removed");
}

/** Used by check-in / transfer pickers. */
export async function availableBedsAction(hostelId: string) {
  return runAction(async () => listAvailableBeds(await tenantOrThrow(), hostelId));
}
