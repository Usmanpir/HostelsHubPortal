import { prisma, type DbClient } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { BedStatus, RentalMode, RoomStatus, RoomType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import {
  accessWhere,
  actorOf,
  assertHostelAccess,
  requirePermission,
  scopedWhere,
  type TenantContext,
} from "@/lib/tenant/context";
import {
  bedSchema,
  bedUpdateSchema,
  bulkRoomsSchema,
  floorSchema,
  roomSchema,
  type BedInput,
  type BedUpdateInput,
  type BulkRoomsInput,
  type FloorInput,
  type RoomInput,
} from "@/lib/validation/property";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { assertWithinLimit } from "@/lib/subscription/limits";
import { serialize } from "@/lib/serialize";
import { refreshRoomStatus } from "./occupancy";

// ─── Floors ─────────────────────────────────────────────────────────────────

export async function listFloors(ctx: TenantContext, hostelId?: string | null) {
  requirePermission(ctx, "rooms.view");
  const floors = await prisma.floor.findMany({
    where: { ...scopedWhere(ctx, hostelId), archivedAt: null, hostel: { archivedAt: null } },
    orderBy: [{ hostel: { name: "asc" } }, { floorNumber: "asc" }],
    include: {
      hostel: { select: { id: true, name: true, code: true, rentalMode: true } },
      _count: { select: { rooms: { where: { archivedAt: null } } } },
    },
  });
  const bedCounts = await prisma.bed.groupBy({
    by: ["roomId"],
    where: { room: { floorId: { in: floors.map((f) => f.id) } }, archivedAt: null },
    _count: { _all: true },
  });
  const rooms = await prisma.room.findMany({
    where: { floorId: { in: floors.map((f) => f.id) }, archivedAt: null },
    select: { id: true, floorId: true },
  });
  const bedsByFloor = new Map<string, number>();
  for (const r of rooms) {
    const n = bedCounts.find((b) => b.roomId === r.id)?._count._all ?? 0;
    bedsByFloor.set(r.floorId, (bedsByFloor.get(r.floorId) ?? 0) + n);
  }
  return floors.map((f) => ({ ...f, bedCount: bedsByFloor.get(f.id) ?? 0 }));
}

export async function createFloor(ctx: TenantContext, raw: FloorInput) {
  requirePermission(ctx, "rooms.manage");
  const input = parseInput(floorSchema, raw);
  assertHostelAccess(ctx, input.hostelId);
  const hostel = await prisma.hostel.findFirst({
    where: { id: input.hostelId, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true },
  });
  if (!hostel) throw new NotFoundError("Hostel");
  const clash = await prisma.floor.findUnique({
    where: { hostelId_floorNumber: { hostelId: input.hostelId, floorNumber: input.floorNumber } },
  });
  if (clash && !clash.archivedAt) throw new ConflictError(`Floor number ${input.floorNumber} already exists in this hostel.`);

  return prisma.$transaction(async (tx) => {
    const floor = clash
      ? await tx.floor.update({ where: { id: clash.id }, data: { ...input, archivedAt: null } })
      : await tx.floor.create({ data: { ...input, organizationId: ctx.organizationId } });
    await audit(actorOf(ctx), { action: "floor.created", entityType: "Floor", entityId: floor.id, after: input }, tx);
    return floor;
  });
}

export async function updateFloor(ctx: TenantContext, id: string, raw: FloorInput) {
  requirePermission(ctx, "rooms.manage");
  const input = parseInput(floorSchema, raw);
  const floor = await prisma.floor.findFirst({ where: { id, ...accessWhere(ctx), archivedAt: null } });
  if (!floor) throw new NotFoundError("Floor");
  if (input.hostelId !== floor.hostelId) throw new BusinessRuleError("A floor cannot be moved to another hostel.");
  if (input.floorNumber !== floor.floorNumber) {
    const clash = await prisma.floor.findUnique({
      where: { hostelId_floorNumber: { hostelId: floor.hostelId, floorNumber: input.floorNumber } },
    });
    if (clash) throw new ConflictError(`Floor number ${input.floorNumber} already exists in this hostel.`);
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.floor.update({
      where: { id },
      data: { name: input.name, floorNumber: input.floorNumber, description: input.description ?? null },
    });
    await audit(actorOf(ctx), { action: "floor.updated", entityType: "Floor", entityId: id, before: floor, after: updated }, tx);
    return updated;
  });
}

export async function archiveFloor(ctx: TenantContext, id: string) {
  requirePermission(ctx, "rooms.manage");
  const floor = await prisma.floor.findFirst({ where: { id, ...accessWhere(ctx), archivedAt: null } });
  if (!floor) throw new NotFoundError("Floor");
  const rooms = await prisma.room.count({ where: { floorId: id, archivedAt: null } });
  if (rooms > 0) throw new BusinessRuleError("Archive or move the rooms on this floor first.");
  await prisma.$transaction(async (tx) => {
    await tx.floor.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(actorOf(ctx), { action: "floor.archived", entityType: "Floor", entityId: id }, tx);
  });
}

// ─── Rooms ──────────────────────────────────────────────────────────────────

export type RoomFilters = {
  hostelId?: string | null;
  floorId?: string;
  status?: RoomStatus;
  roomType?: RoomType;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listRooms(ctx: TenantContext, filters: RoomFilters = {}) {
  requirePermission(ctx, "rooms.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where: Prisma.RoomWhereInput = {
    ...scopedWhere(ctx, filters.hostelId),
    archivedAt: null,
    hostel: { archivedAt: null },
    ...(filters.floorId ? { floorId: filters.floorId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.roomType ? { roomType: filters.roomType } : {}),
    ...(filters.q ? { roomNumber: { contains: filters.q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.room.findMany({
      where,
      skip,
      take,
      orderBy: [{ hostel: { name: "asc" } }, { floor: { floorNumber: "asc" } }, { roomNumber: "asc" }],
      include: {
        hostel: { select: { id: true, name: true, code: true, rentalMode: true } },
        floor: { select: { id: true, name: true, floorNumber: true } },
        beds: { where: { archivedAt: null }, select: { id: true, status: true } },
      },
    }),
    prisma.room.count({ where }),
  ]);
  const items = rows.map(({ beds, ...room }) => ({
    ...room,
    bedCount: beds.length,
    occupiedCount: beds.filter((b) => b.status === "OCCUPIED").length,
    availableCount: beds.filter((b) => b.status === "AVAILABLE").length,
  }));
  return serialize(toPaginated(items, total, page, pageSize));
}

export async function getRoom(ctx: TenantContext, id: string) {
  requirePermission(ctx, "rooms.view");
  const room = await prisma.room.findFirst({
    where: { id, ...accessWhere(ctx), archivedAt: null },
    include: {
      hostel: { select: { id: true, name: true, code: true, rentalMode: true } },
      floor: { select: { id: true, name: true, floorNumber: true } },
      beds: {
        where: { archivedAt: null },
        orderBy: { bedNumber: "asc" },
        include: {
          assignments: {
            where: { status: { in: ["ACTIVE", "RESERVED"] } },
            select: {
              id: true,
              status: true,
              checkInDate: true,
              monthlyRent: true,
              resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true } },
            },
          },
        },
      },
    },
  });
  if (!room) throw new NotFoundError("Room");
  return serialize(room);
}

async function loadFloorForWrite(ctx: TenantContext, floorId: string) {
  const floor = await prisma.floor.findFirst({
    where: { id: floorId, ...accessWhere(ctx), archivedAt: null, hostel: { archivedAt: null } },
    select: { id: true, hostelId: true, hostel: { select: { rentalMode: true } } },
  });
  if (!floor) throw new NotFoundError("Floor");
  return { id: floor.id, hostelId: floor.hostelId, rentalMode: floor.hostel.rentalMode };
}

/** Whole-unit rentals: a unit is leased to one tenant, represented by exactly one bed. */
function assertWholeUnitCapacity(rentalMode: RentalMode, capacity: number) {
  if (rentalMode === "WHOLE_UNIT" && capacity !== 1) {
    throw new BusinessRuleError("Units in a whole-unit property are rented to one tenant — capacity must be 1.");
  }
}

async function createBedsForRoom(
  db: DbClient,
  room: { id: string; organizationId: string; hostelId: string },
  count: number,
  startAt = 1,
) {
  if (count <= 0) return;
  await db.bed.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      organizationId: room.organizationId,
      hostelId: room.hostelId,
      roomId: room.id,
      bedNumber: String(startAt + i),
    })),
  });
}

export async function createRoom(ctx: TenantContext, raw: RoomInput) {
  requirePermission(ctx, "rooms.manage");
  const input = parseInput(roomSchema, raw);
  const floor = await loadFloorForWrite(ctx, input.floorId);
  assertWholeUnitCapacity(floor.rentalMode, input.capacity);
  // A whole unit always gets its single bed, so it can be leased right away.
  const bedsToCreate =
    floor.rentalMode === "WHOLE_UNIT" ? 1 : Math.min(input.createBeds ?? input.capacity, input.capacity);
  if (bedsToCreate > 0) await assertWithinLimit(prisma, ctx.organizationId, "beds", bedsToCreate);

  const clash = await prisma.room.findUnique({
    where: { hostelId_roomNumber: { hostelId: floor.hostelId, roomNumber: input.roomNumber } },
  });
  if (clash) throw new ConflictError(`Room ${input.roomNumber} already exists in this hostel.`);

  const { createBeds: _createBeds, ...data } = input;
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.create({
      data: {
        ...data,
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        areaSqft: data.areaSqft ?? null,
        status: data.status ?? "AVAILABLE",
        organizationId: ctx.organizationId,
        hostelId: floor.hostelId,
      },
    });
    await createBedsForRoom(tx, room, bedsToCreate);
    await audit(actorOf(ctx), { action: "room.created", entityType: "Room", entityId: room.id, after: { ...input, bedsCreated: bedsToCreate } }, tx);
    return serialize(room);
  });
}

export async function bulkCreateRooms(ctx: TenantContext, raw: BulkRoomsInput) {
  requirePermission(ctx, "rooms.manage");
  const input = parseInput(bulkRoomsSchema, raw);
  const floor = await loadFloorForWrite(ctx, input.floorId);
  assertWholeUnitCapacity(floor.rentalMode, input.capacity);
  await assertWithinLimit(prisma, ctx.organizationId, "beds", input.count * input.capacity);
  const numbers = Array.from({ length: input.count }, (_, i) => `${input.prefix}${input.startNumber + i}`);
  const clashes = await prisma.room.findMany({
    where: { hostelId: floor.hostelId, roomNumber: { in: numbers } },
    select: { roomNumber: true },
  });
  if (clashes.length) {
    throw new ConflictError(`These rooms already exist: ${clashes.map((c) => c.roomNumber).join(", ")}`);
  }
  return prisma.$transaction(async (tx) => {
    for (const roomNumber of numbers) {
      const room = await tx.room.create({
        data: {
          organizationId: ctx.organizationId,
          hostelId: floor.hostelId,
          floorId: floor.id,
          roomNumber,
          roomType: input.roomType,
          capacity: input.capacity,
          rent: input.rent ?? null,
          bedrooms: input.bedrooms ?? null,
          bathrooms: input.bathrooms ?? null,
          areaSqft: input.areaSqft ?? null,
          furnished: input.furnished,
        },
      });
      await createBedsForRoom(tx, room, input.capacity);
    }
    await audit(actorOf(ctx), { action: "room.bulk_created", entityType: "Floor", entityId: floor.id, after: { rooms: numbers, capacity: input.capacity } }, tx);
    return { created: numbers.length };
  });
}

export async function updateRoom(ctx: TenantContext, id: string, raw: RoomInput) {
  requirePermission(ctx, "rooms.manage");
  const input = parseInput(roomSchema, raw);
  const before = await prisma.room.findFirst({ where: { id, ...accessWhere(ctx), archivedAt: null } });
  if (!before) throw new NotFoundError("Room");
  const floor = await loadFloorForWrite(ctx, input.floorId);
  if (floor.hostelId !== before.hostelId) throw new BusinessRuleError("A room cannot be moved to another hostel.");
  assertWholeUnitCapacity(floor.rentalMode, input.capacity);

  const bedCount = await prisma.bed.count({ where: { roomId: id, archivedAt: null } });
  if (input.capacity < bedCount) {
    throw new BusinessRuleError(`This room has ${bedCount} beds. Remove beds before lowering capacity below that.`);
  }
  if (input.roomNumber !== before.roomNumber) {
    const clash = await prisma.room.findUnique({
      where: { hostelId_roomNumber: { hostelId: before.hostelId, roomNumber: input.roomNumber } },
    });
    if (clash) throw new ConflictError(`Room ${input.roomNumber} already exists in this hostel.`);
  }
  if (input.status && ["MAINTENANCE", "INACTIVE"].includes(input.status)) {
    const occupied = await prisma.bed.count({ where: { roomId: id, status: { in: ["OCCUPIED", "RESERVED"] } } });
    if (occupied > 0) throw new BusinessRuleError("Move residents out of this room before marking it unavailable.");
  }

  const { createBeds: _createBeds, ...data } = input;
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.update({
      where: { id },
      data: {
        ...data,
        rent: data.rent ?? null,
        description: data.description ?? null,
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        areaSqft: data.areaSqft ?? null,
        // Occupancy statuses are derived; only manual statuses are taken from input.
        status:
          data.status && ["MAINTENANCE", "INACTIVE", "RESERVED"].includes(data.status)
            ? data.status
            : before.status === "MAINTENANCE" || before.status === "INACTIVE" || before.status === "RESERVED"
              ? "AVAILABLE"
              : before.status,
      },
    });
    await refreshRoomStatus(tx, id);
    await audit(actorOf(ctx), { action: "room.updated", entityType: "Room", entityId: id, before, after: room }, tx);
    return serialize(room);
  });
}

export async function archiveRoom(ctx: TenantContext, id: string) {
  requirePermission(ctx, "rooms.manage");
  const room = await prisma.room.findFirst({ where: { id, ...accessWhere(ctx), archivedAt: null } });
  if (!room) throw new NotFoundError("Room");
  const live = await prisma.residentAssignment.count({ where: { roomId: id, status: { in: ["ACTIVE", "RESERVED"] } } });
  if (live > 0) throw new BusinessRuleError("This room has residents. Check them out or transfer them first.");
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.bed.updateMany({ where: { roomId: id, archivedAt: null }, data: { archivedAt: now, status: "INACTIVE" } });
    await tx.room.update({ where: { id }, data: { archivedAt: now, status: "INACTIVE" } });
    await audit(actorOf(ctx), { action: "room.archived", entityType: "Room", entityId: id }, tx);
  });
}

// ─── Beds ───────────────────────────────────────────────────────────────────

export type BedFilters = {
  hostelId?: string | null;
  roomId?: string;
  status?: BedStatus;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listBeds(ctx: TenantContext, filters: BedFilters = {}) {
  requirePermission(ctx, "rooms.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where: Prisma.BedWhereInput = {
    ...scopedWhere(ctx, filters.hostelId),
    archivedAt: null,
    hostel: { archivedAt: null },
    ...(filters.roomId ? { roomId: filters.roomId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q
      ? {
          OR: [
            { bedNumber: { contains: filters.q, mode: "insensitive" } },
            { room: { roomNumber: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.bed.findMany({
      where,
      skip,
      take,
      orderBy: [{ hostel: { name: "asc" } }, { room: { roomNumber: "asc" } }, { bedNumber: "asc" }],
      include: {
        hostel: { select: { id: true, name: true, rentalMode: true } },
        room: { select: { id: true, roomNumber: true, rent: true, floor: { select: { name: true } } } },
        assignments: {
          where: { status: { in: ["ACTIVE", "RESERVED"] } },
          select: { id: true, status: true, resident: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.bed.count({ where }),
  ]);
  return serialize(toPaginated(rows, total, page, pageSize));
}

export async function createBed(ctx: TenantContext, raw: BedInput) {
  requirePermission(ctx, "rooms.manage");
  const input = parseInput(bedSchema, raw);
  const room = await prisma.room.findFirst({
    where: { id: input.roomId, ...accessWhere(ctx), archivedAt: null },
    include: { _count: { select: { beds: { where: { archivedAt: null } } } } },
  });
  if (!room) throw new NotFoundError("Room");
  if (room._count.beds >= room.capacity) {
    throw new BusinessRuleError(`Room ${room.roomNumber} is at its capacity of ${room.capacity} beds. Increase capacity first.`);
  }
  await assertWithinLimit(prisma, ctx.organizationId, "beds");
  const clash = await prisma.bed.findUnique({ where: { roomId_bedNumber: { roomId: room.id, bedNumber: input.bedNumber } } });
  if (clash && !clash.archivedAt) throw new ConflictError(`Bed ${input.bedNumber} already exists in this room.`);

  return prisma.$transaction(async (tx) => {
    const data = {
      bedNumber: input.bedNumber,
      monthlyRent: input.monthlyRent ?? null,
      notes: input.notes ?? null,
      status: "AVAILABLE" as const,
      archivedAt: null,
    };
    const bed = clash
      ? await tx.bed.update({ where: { id: clash.id }, data })
      : await tx.bed.create({
          data: { ...data, organizationId: ctx.organizationId, hostelId: room.hostelId, roomId: room.id },
        });
    await refreshRoomStatus(tx, room.id);
    await audit(actorOf(ctx), { action: "bed.created", entityType: "Bed", entityId: bed.id, after: input }, tx);
    return serialize(bed);
  });
}

export async function updateBed(ctx: TenantContext, id: string, raw: BedUpdateInput) {
  requirePermission(ctx, "rooms.manage");
  const input = parseInput(bedUpdateSchema, raw);
  const before = await prisma.bed.findFirst({ where: { id, ...accessWhere(ctx), archivedAt: null } });
  if (!before) throw new NotFoundError("Bed");

  const live = await prisma.residentAssignment.findFirst({
    where: { activeBedId: id },
    select: { status: true },
  });
  // Occupied/Reserved are controlled by check-in/check-out, not by hand.
  let status = input.status;
  if (live) {
    status = live.status === "ACTIVE" ? "OCCUPIED" : "RESERVED";
    if (input.status !== status) {
      throw new BusinessRuleError("This bed has a resident. Check them out or transfer them before changing its status.");
    }
  } else if (input.status === "OCCUPIED" || input.status === "RESERVED") {
    throw new BusinessRuleError("Use check-in or reservation to occupy a bed.");
  }
  if (input.bedNumber !== before.bedNumber) {
    const clash = await prisma.bed.findUnique({ where: { roomId_bedNumber: { roomId: before.roomId, bedNumber: input.bedNumber } } });
    if (clash) throw new ConflictError(`Bed ${input.bedNumber} already exists in this room.`);
  }
  return prisma.$transaction(async (tx) => {
    const bed = await tx.bed.update({
      where: { id },
      data: { bedNumber: input.bedNumber, monthlyRent: input.monthlyRent ?? null, notes: input.notes ?? null, status },
    });
    await refreshRoomStatus(tx, before.roomId);
    await audit(actorOf(ctx), { action: "bed.updated", entityType: "Bed", entityId: id, before, after: bed }, tx);
    return serialize(bed);
  });
}

export async function archiveBed(ctx: TenantContext, id: string) {
  requirePermission(ctx, "rooms.manage");
  const bed = await prisma.bed.findFirst({ where: { id, ...accessWhere(ctx), archivedAt: null } });
  if (!bed) throw new NotFoundError("Bed");
  const live = await prisma.residentAssignment.count({ where: { activeBedId: id } });
  if (live > 0) throw new BusinessRuleError("This bed has a resident. Check them out or transfer them first.");
  await prisma.$transaction(async (tx) => {
    await tx.bed.update({ where: { id }, data: { archivedAt: new Date(), status: "INACTIVE" } });
    await refreshRoomStatus(tx, bed.roomId);
    await audit(actorOf(ctx), { action: "bed.archived", entityType: "Bed", entityId: id }, tx);
  });
}

// ─── Room map (visualizer) ──────────────────────────────────────────────────

export async function getRoomMap(ctx: TenantContext, hostelId: string) {
  requirePermission(ctx, "rooms.view");
  assertHostelAccess(ctx, hostelId);
  const floors = await prisma.floor.findMany({
    where: { hostelId, organizationId: ctx.organizationId, archivedAt: null },
    orderBy: { floorNumber: "asc" },
    include: {
      rooms: {
        where: { archivedAt: null },
        orderBy: { roomNumber: "asc" },
        include: {
          beds: {
            where: { archivedAt: null },
            orderBy: { bedNumber: "asc" },
            include: {
              assignments: {
                where: { status: { in: ["ACTIVE", "RESERVED"] } },
                select: {
                  id: true,
                  status: true,
                  checkInDate: true,
                  monthlyRent: true,
                  resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  return serialize(floors);
}

/** Beds available for check-in/transfer in one hostel, grouped by floor/room. */
export async function listAvailableBeds(ctx: TenantContext, hostelId: string) {
  requirePermission(ctx, "rooms.view");
  assertHostelAccess(ctx, hostelId);
  const beds = await prisma.bed.findMany({
    where: {
      organizationId: ctx.organizationId,
      hostelId,
      archivedAt: null,
      status: "AVAILABLE",
      room: { archivedAt: null, status: { notIn: ["MAINTENANCE", "INACTIVE"] } },
    },
    orderBy: [{ room: { floor: { floorNumber: "asc" } } }, { room: { roomNumber: "asc" } }, { bedNumber: "asc" }],
    include: {
      hostel: { select: { rentalMode: true } },
      room: {
        select: { id: true, roomNumber: true, roomType: true, rent: true, floor: { select: { id: true, name: true } } },
      },
    },
  });
  return serialize(beds);
}
