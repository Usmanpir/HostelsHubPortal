import { describe, expect, it, beforeAll } from "vitest";
import { BusinessRuleError, ConflictError } from "@/lib/errors";
import { computeOccupancy, getOccupancy } from "@/services/hostel/occupancy";
import { archiveFloor, createBed, createRoom, bulkCreateRooms, updateBed, updateRoom } from "@/services/hostel/structure-service";
import type { TenantContext } from "@/lib/tenant/context";
import { createHostelWithRoom, createTenant, prisma } from "./helpers";

describe("hostel structure rules", () => {
  let ctx: TenantContext;
  let floorId: string;
  let roomId: string;
  let hostelId: string;

  beforeAll(async () => {
    const t = await createTenant("Structure Org");
    const s = await createHostelWithRoom(t.ctx, 2);
    ctx = s.ctx;
    floorId = s.floor.id;
    roomId = s.room.id;
    hostelId = s.hostel.id;
  });

  it("creates beds automatically to match capacity", async () => {
    expect(await prisma.bed.count({ where: { roomId } })).toBe(2);
  });

  it("a room cannot exceed its configured capacity", async () => {
    await expect(createBed(ctx, { roomId, bedNumber: "3" })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("capacity cannot be lowered below the number of beds", async () => {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    await expect(updateRoom(ctx, roomId, { floorId, roomNumber: room.roomNumber, capacity: 1 })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("room numbers are unique within a hostel", async () => {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    await expect(createRoom(ctx, { floorId, roomNumber: room.roomNumber, capacity: 1 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("bulk creates numbered rooms with beds", async () => {
    const result = await bulkCreateRooms(ctx, { floorId, prefix: "B", startNumber: 1, count: 3, capacity: 3 });
    expect(result.created).toBe(3);
    expect(await prisma.bed.count({ where: { room: { floorId, roomNumber: { in: ["B1", "B2", "B3"] } } } })).toBe(9);
  });

  it("beds cannot be marked occupied by hand", async () => {
    const bed = await prisma.bed.findFirstOrThrow({ where: { roomId } });
    await expect(updateBed(ctx, bed.id, { bedNumber: bed.bedNumber, status: "OCCUPIED" })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("floors with rooms cannot be removed", async () => {
    await expect(archiveFloor(ctx, floorId)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("occupancy excludes maintenance and inactive beds from capacity", async () => {
    const stats = computeOccupancy({ OCCUPIED: 8, AVAILABLE: 1, MAINTENANCE: 1, INACTIVE: 0 });
    expect(stats.totalBeds).toBe(10);
    expect(stats.occupancyRate).toBe(88.9);
    expect(computeOccupancy({}).occupancyRate).toBe(0);

    const bed = await prisma.bed.findFirstOrThrow({ where: { roomId } });
    await updateBed(ctx, bed.id, { bedNumber: bed.bedNumber, status: "MAINTENANCE" });
    const { byHostel } = await getOccupancy(ctx, hostelId);
    expect(byHostel.get(hostelId)?.maintenanceBeds).toBe(1);
  });
});
