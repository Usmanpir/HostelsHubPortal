"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
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

export async function createHostelAction(input: HostelInput) {
  return runAction(async () => {
    const hostel = await createHostel(await tenantOrThrow(), input);
    revalidatePath("/hostels");
    return { id: hostel.id };
  }, "Hostel created");
}

export async function updateHostelAction(id: string, input: HostelInput) {
  return runAction(async () => {
    await updateHostel(await tenantOrThrow(), id, input);
    revalidatePath("/hostels");
    revalidatePath(`/hostels/${id}`);
    return { id };
  }, "Hostel updated");
}

export async function archiveHostelAction(id: string) {
  return runAction(async () => {
    await archiveHostel(await tenantOrThrow(), id);
    revalidatePath("/hostels");
    return null;
  }, "Hostel archived");
}

export async function restoreHostelAction(id: string) {
  return runAction(async () => {
    await restoreHostel(await tenantOrThrow(), id);
    revalidatePath("/hostels");
    return null;
  }, "Hostel restored");
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
  return runAction(async () => {
    const room = await createRoom(await tenantOrThrow(), input);
    revalidatePath("/hostels", "layout");
    return { id: room.id };
  }, "Room created");
}

export async function bulkCreateRoomsAction(input: BulkRoomsInput) {
  return runAction(async () => {
    const result = await bulkCreateRooms(await tenantOrThrow(), input);
    revalidatePath("/hostels", "layout");
    return result;
  });
}

export async function updateRoomAction(id: string, input: RoomInput) {
  return runAction(async () => {
    await updateRoom(await tenantOrThrow(), id, input);
    revalidatePath("/hostels", "layout");
    return { id };
  }, "Room updated");
}

export async function archiveRoomAction(id: string) {
  return runAction(async () => {
    await archiveRoom(await tenantOrThrow(), id);
    revalidatePath("/hostels", "layout");
    return null;
  }, "Room archived");
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
