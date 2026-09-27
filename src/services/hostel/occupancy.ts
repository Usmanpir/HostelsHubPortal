import type { DbClient } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import type { BedStatus, RoomStatus } from "@/generated/prisma/enums";
import { scopedWhere, type TenantContext } from "@/lib/tenant/context";

const MANUAL_ROOM_STATUSES: RoomStatus[] = ["MAINTENANCE", "INACTIVE", "RESERVED"];

/**
 * Recompute a room's occupancy status from its beds. Manually-set statuses
 * (maintenance / inactive / reserved) are preserved.
 */
export async function refreshRoomStatus(db: DbClient, roomId: string) {
  const room = await db.room.findUnique({ where: { id: roomId }, select: { status: true } });
  if (!room || MANUAL_ROOM_STATUSES.includes(room.status)) return;
  const beds = await db.bed.groupBy({
    by: ["status"],
    where: { roomId, archivedAt: null },
    _count: { _all: true },
  });
  const count = (s: BedStatus) => beds.find((b) => b.status === s)?._count._all ?? 0;
  const usable = beds.reduce((sum, b) => sum + (b.status === "INACTIVE" ? 0 : b._count._all), 0);
  const taken = count("OCCUPIED") + count("RESERVED");
  const status: RoomStatus = taken === 0 ? "AVAILABLE" : taken >= usable ? "FULL" : "PARTIALLY_OCCUPIED";
  if (status !== room.status) await db.room.update({ where: { id: roomId }, data: { status } });
}

export type OccupancyStats = {
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  reservedBeds: number;
  maintenanceBeds: number;
  inactiveBeds: number;
  /** occupied / (total − maintenance − inactive) × 100 */
  occupancyRate: number;
};

export function computeOccupancy(counts: Partial<Record<BedStatus, number>>): OccupancyStats {
  const occupied = counts.OCCUPIED ?? 0;
  const available = counts.AVAILABLE ?? 0;
  const reserved = counts.RESERVED ?? 0;
  const maintenance = counts.MAINTENANCE ?? 0;
  const inactive = counts.INACTIVE ?? 0;
  const total = occupied + available + reserved + maintenance + inactive;
  const capacity = total - maintenance - inactive;
  return {
    totalBeds: total,
    occupiedBeds: occupied,
    availableBeds: available,
    reservedBeds: reserved,
    maintenanceBeds: maintenance,
    inactiveBeds: inactive,
    occupancyRate: capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : 0,
  };
}

/** Occupancy for the current hostel scope, overall and per hostel. */
export async function getOccupancy(ctx: TenantContext, hostelId?: string | null) {
  const rows = await prisma.bed.groupBy({
    by: ["hostelId", "status"],
    where: { ...scopedWhere(ctx, hostelId), archivedAt: null, hostel: { archivedAt: null } },
    _count: { _all: true },
  });
  const overall: Partial<Record<BedStatus, number>> = {};
  const perHostel = new Map<string, Partial<Record<BedStatus, number>>>();
  for (const row of rows) {
    overall[row.status] = (overall[row.status] ?? 0) + row._count._all;
    const h = perHostel.get(row.hostelId) ?? {};
    h[row.status] = (h[row.status] ?? 0) + row._count._all;
    perHostel.set(row.hostelId, h);
  }
  return {
    overall: computeOccupancy(overall),
    byHostel: new Map([...perHostel].map(([id, counts]) => [id, computeOccupancy(counts)])),
  };
}
