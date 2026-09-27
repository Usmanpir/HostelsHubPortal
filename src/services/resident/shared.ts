import type { Tx } from "@/lib/db/prisma";
import type { AssignmentStatus, ResidentStatus } from "@/generated/prisma/enums";
import { BusinessRuleError, isAppError } from "@/lib/errors";

/** Assignment statuses that hold a bed (mirrored by activeBedId / activeResidentId). */
export const LIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["RESERVED", "ACTIVE"];

/** Residents that count against the plan's "active residents" limit. */
export const COUNTED_RESIDENT_STATUSES: ResidentStatus[] = ["ACTIVE", "NOTICE", "SUSPENDED"];

/** Row-level lock on beds, always in a stable order so two transfers can't deadlock. */
export async function lockBeds(tx: Tx, organizationId: string, bedIds: string[]) {
  for (const id of [...new Set(bedIds)].sort()) {
    await tx.$queryRaw`SELECT id FROM "Bed" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
  }
}

/** Serialize concurrent workflows for the same resident. */
export async function lockResident(tx: Tx, organizationId: string, residentId: string) {
  await tx.$queryRaw`SELECT id FROM "Resident" WHERE id = ${residentId} AND "organizationId" = ${organizationId} FOR UPDATE`;
}

export function placementLabel(p: { room: { roomNumber: string }; bed: { bedNumber: string } } | { roomNumber: string; bedNumber: string }) {
  return "room" in p ? `Room ${p.room.roomNumber} · Bed ${p.bed.bedNumber}` : `Room ${p.roomNumber} · Bed ${p.bedNumber}`;
}

/**
 * The unique indexes on activeBedId / activeResidentId are the last line of
 * defence against double booking. Turn a violation into a friendly message.
 */
export function mapAssignmentConflict(error: unknown): unknown {
  if (isAppError(error)) return error;
  if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
    const detail = JSON.stringify((error as { meta?: unknown }).meta ?? {}) + String((error as { message?: string }).message ?? "");
    if (detail.includes("activeBedId")) {
      return new BusinessRuleError("This bed was just taken by another check-in. Pick a different bed.");
    }
    if (detail.includes("activeResidentId")) {
      return new BusinessRuleError("This resident already has an active stay. Refresh the page to see it.");
    }
    return new BusinessRuleError("This bed or resident was just updated by someone else. Refresh and try again.");
  }
  return error;
}

/** Add calendar months to a UTC date-only value (clamps to month end), minus `minusDays`. */
export function addMonthsUtc(date: Date, months: number, minusDays = 0) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(date.getUTCDate(), lastDay);
  return new Date(Date.UTC(y, m, d) - minusDays * 86400_000);
}
