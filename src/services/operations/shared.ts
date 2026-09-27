import { prisma, type DbClient } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { assertHostelAccess, requireAnyPermission, type TenantContext } from "@/lib/tenant/context";
import { fullName } from "@/lib/format";

// ─── Time zone helpers ──────────────────────────────────────────────────────

/** Milliseconds the given IANA zone is ahead of UTC at `instant`. */
function zoneOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which calendar day `ymd` (YYYY-MM-DD) starts in `timeZone`. */
export function startOfDayInZone(ymd: string, timeZone: string): Date {
  const utcMidnight = new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  const first = zoneOffsetMs(utcMidnight, timeZone);
  const guess = new Date(utcMidnight.getTime() - first);
  // Re-check once so days that start on a DST transition resolve correctly.
  const second = zoneOffsetMs(guess, timeZone);
  return second === first ? guess : new Date(utcMidnight.getTime() - second);
}

/** The UTC instant at which calendar day `ymd` ends (exclusive) in `timeZone`. */
export function endOfDayInZone(ymd: string, timeZone: string): Date {
  const next = new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfDayInZone(next.toISOString().slice(0, 10), timeZone);
}

/** YYYY-MM-DD of `instant` in `timeZone`. */
export function dayInZone(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

// ─── Reference validation ───────────────────────────────────────────────────

/** Ensures the hostel is accessible to the member and not archived. */
export async function assertWritableHostel(ctx: TenantContext, hostelId: string, db: DbClient = prisma) {
  assertHostelAccess(ctx, hostelId);
  const hostel = await db.hostel.findFirst({
    where: { id: hostelId, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!hostel) throw new NotFoundError("Hostel");
  return hostel;
}

/** A staff member of this organization who is assigned to `hostelId`. */
export async function assertAssignableStaff(ctx: TenantContext, hostelId: string, staffId: string, db: DbClient = prisma) {
  const staff = await db.staff.findFirst({
    where: {
      id: staffId,
      organizationId: ctx.organizationId,
      archivedAt: null,
      status: { in: ["ACTIVE", "ON_LEAVE"] },
      hostels: { some: { hostelId } },
    },
    select: { id: true, userId: true, firstName: true, lastName: true },
  });
  if (!staff) throw new NotFoundError("Staff member (they must be assigned to this hostel)");
  return staff;
}

/** A non-archived resident of this organization registered at `hostelId`. */
export async function assertResidentInHostel(ctx: TenantContext, hostelId: string, residentId: string, db: DbClient = prisma) {
  const resident = await db.resident.findFirst({
    where: { id: residentId, organizationId: ctx.organizationId, hostelId, archivedAt: null },
    select: { id: true, firstName: true, lastName: true, userId: true },
  });
  if (!resident) throw new NotFoundError("Resident (they must belong to this hostel)");
  return resident;
}

/** Staff who can be assigned maintenance or complaints in a hostel. */
export async function listAssignableStaff(ctx: TenantContext, hostelId: string) {
  requireAnyPermission(ctx, "maintenance.manage", "complaints.manage");
  assertHostelAccess(ctx, hostelId);
  const staff = await prisma.staff.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      status: { in: ["ACTIVE", "ON_LEAVE"] },
      hostels: { some: { hostelId } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, designation: true, status: true },
  });
  return staff.map((s) => ({ id: s.id, name: fullName(s), designation: s.designation, onLeave: s.status === "ON_LEAVE" }));
}

// ─── Timeline ───────────────────────────────────────────────────────────────

export type TimelineEntry = {
  id: string;
  action: string;
  createdAt: Date;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
};

/** Audit history of one record, oldest first. Caller must have authorized access to the record. */
export async function getEntityTimeline(ctx: TenantContext, entityType: string, entityId: string): Promise<TimelineEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId, entityType, entityId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, action: true, createdAt: true, metadata: true, user: { select: { name: true } } },
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    createdAt: l.createdAt,
    actorName: l.user?.name ?? null,
    metadata: l.metadata && typeof l.metadata === "object" && !Array.isArray(l.metadata) ? (l.metadata as Record<string, unknown>) : null,
  }));
}

/** Priority ordering helper for in-memory sorts (URGENT first). */
export const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
