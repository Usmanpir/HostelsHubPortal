import { prisma } from "@/lib/db/prisma";
import type { AttendanceStatus, LeaveType, StaffType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { actorOf, assertHostelAccess, requirePermission, type TenantContext } from "@/lib/tenant/context";
import {
  attendanceBatchSchema,
  daysInMonth,
  EMPLOYED_STATUSES,
  monthKey,
  type AttendanceBatchInput,
} from "@/lib/validation/staff";
import { parseInput } from "@/lib/validation/parse";
import { serialize } from "@/lib/serialize";
import { dateOnly, fullName, todayInTimeZone } from "@/lib/format";
import { staffAccessWhere, staffScopeWhere } from "./scope";
import { summarizeAttendance, type AttendanceTotals } from "./attendance-math";

const DAY = 86400_000;

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Employed staff in scope who had joined by `onOrBefore`. */
function sheetStaffWhere(ctx: TenantContext, hostelId: string | null | undefined, onOrBefore: Date) {
  return {
    ...staffScopeWhere(ctx, hostelId),
    archivedAt: null,
    status: { in: [...EMPLOYED_STATUSES] },
    joiningDate: { lte: onOrBefore },
  };
}

// ─── Daily sheet ────────────────────────────────────────────────────────────

export type DailySheetRow = {
  staffId: string;
  name: string;
  employeeCode: string;
  designation: StaffType;
  photoFileId: string | null;
  primaryHostel: { id: string; name: string } | null;
  record: {
    status: AttendanceStatus;
    checkInTime: string | null;
    checkOutTime: string | null;
    notes: string | null;
    markedBy: string | null;
    updatedAt: Date;
  } | null;
  /** Approved leave covering the date — the sheet pre-selects LEAVE when unmarked. */
  approvedLeave: { id: string; type: LeaveType; startDate: Date; endDate: Date } | null;
};

export async function getDailySheet(ctx: TenantContext, input: { date?: string | null; hostelId?: string | null } = {}) {
  requirePermission(ctx, "attendance.view");
  if (input.hostelId) assertHostelAccess(ctx, input.hostelId);
  const dateKey = input.date ?? todayInTimeZone(ctx.organization.timezone);
  const date = dateOnly(dateKey);
  if (Number.isNaN(date.getTime())) throw new ValidationError("Enter a valid date.");

  const staff = await prisma.staff.findMany({
    where: sheetStaffWhere(ctx, input.hostelId, date),
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      photoFileId: true,
      hostels: { where: { isPrimary: true }, select: { hostel: { select: { id: true, name: true } } } },
    },
  });
  const ids = staff.map((s) => s.id);
  const [records, leaves] = await Promise.all([
    prisma.staffAttendance.findMany({
      where: { organizationId: ctx.organizationId, staffId: { in: ids }, date },
      include: { markedBy: { select: { name: true } } },
    }),
    prisma.staffLeave.findMany({
      where: {
        organizationId: ctx.organizationId,
        staffId: { in: ids },
        status: "APPROVED",
        startDate: { lte: date },
        endDate: { gte: date },
      },
      select: { id: true, staffId: true, type: true, startDate: true, endDate: true },
    }),
  ]);
  const recordBy = new Map(records.map((r) => [r.staffId, r]));
  const leaveBy = new Map(leaves.map((l) => [l.staffId, l]));

  const rows: DailySheetRow[] = staff.map((s) => {
    const r = recordBy.get(s.id);
    const l = leaveBy.get(s.id);
    return {
      staffId: s.id,
      name: fullName(s),
      employeeCode: s.employeeCode,
      designation: s.designation,
      photoFileId: s.photoFileId,
      primaryHostel: s.hostels[0]?.hostel ?? null,
      record: r
        ? {
            status: r.status,
            checkInTime: r.checkInTime,
            checkOutTime: r.checkOutTime,
            notes: r.notes,
            markedBy: r.markedBy?.name ?? null,
            updatedAt: r.updatedAt,
          }
        : null,
      approvedLeave: l ? { id: l.id, type: l.type, startDate: l.startDate, endDate: l.endDate } : null,
    };
  });

  const totals = summarizeAttendance(records.map((r) => r.status));
  return serialize({ date: dateKey, rows, totals, marked: records.length, total: rows.length });
}

/** Upsert a batch of attendance marks for one date (unique on staffId + date). */
export async function saveAttendance(ctx: TenantContext, raw: AttendanceBatchInput) {
  requirePermission(ctx, "attendance.manage");
  const input = parseInput(attendanceBatchSchema, raw);
  if (input.hostelId) assertHostelAccess(ctx, input.hostelId);
  const date = dateOnly(input.date);
  const today = dateOnly(todayInTimeZone(ctx.organization.timezone));
  if (date.getTime() > today.getTime()) throw new BusinessRuleError("Attendance can't be marked for a future date.");

  const staffIds = [...new Set(input.entries.map((e) => e.staffId))];
  if (staffIds.length !== input.entries.length) throw new ValidationError("Each staff member can only be marked once per date.");
  const staff = await prisma.staff.findMany({
    where: { id: { in: staffIds }, ...staffAccessWhere(ctx), archivedAt: null },
    select: {
      id: true,
      joiningDate: true,
      firstName: true,
      lastName: true,
      hostels: { select: { hostelId: true, isPrimary: true } },
    },
  });
  if (staff.length !== staffIds.length) throw new NotFoundError("Staff member");
  const byId = new Map(staff.map((s) => [s.id, s]));
  for (const s of staff) {
    if (s.joiningDate.getTime() > date.getTime()) {
      throw new BusinessRuleError(`${fullName(s)} had not joined yet on this date.`);
    }
  }
  for (const e of input.entries) {
    if (e.checkInTime && e.checkOutTime && e.checkOutTime < e.checkInTime) {
      throw new ValidationError("Check-out time can't be before check-in time.");
    }
  }

  /** Record the hostel it was taken at, if the employee works there; else their accessible primary hostel. */
  const hostelFor = (staffId: string) => {
    const assignments = byId.get(staffId)!.hostels.filter((h) => ctx.accessibleHostelIds.includes(h.hostelId));
    if (input.hostelId && assignments.some((h) => h.hostelId === input.hostelId)) return input.hostelId;
    return (assignments.find((h) => h.isPrimary) ?? assignments[0])?.hostelId ?? null;
  };

  const existing = await prisma.staffAttendance.findMany({
    where: { organizationId: ctx.organizationId, staffId: { in: staffIds }, date },
    select: { staffId: true, status: true },
  });
  const beforeBy = new Map(existing.map((r) => [r.staffId, r.status]));

  await prisma.$transaction(async (tx) => {
    for (const e of input.entries) {
      const data = {
        status: e.status,
        checkInTime: e.checkInTime ?? null,
        checkOutTime: e.checkOutTime ?? null,
        notes: e.notes ?? null,
        markedById: ctx.userId,
        hostelId: hostelFor(e.staffId),
      };
      await tx.staffAttendance.upsert({
        where: { staffId_date: { staffId: e.staffId, date } },
        create: { ...data, organizationId: ctx.organizationId, staffId: e.staffId, date },
        update: data,
      });
    }
    const changed = input.entries.filter((e) => beforeBy.get(e.staffId) !== e.status);
    await audit(
      actorOf(ctx),
      {
        action: "attendance.marked",
        entityType: "StaffAttendance",
        entityId: null,
        metadata: {
          date: toKey(date),
          hostelId: input.hostelId ?? null,
          count: input.entries.length,
          changes: changed.map((e) => ({ staffId: e.staffId, before: beforeBy.get(e.staffId) ?? null, after: e.status })),
        },
      },
      tx,
    );
  });
  return { saved: input.entries.length };
}

// ─── Monthly view ───────────────────────────────────────────────────────────

export type MonthlyAttendanceRow = {
  staffId: string;
  name: string;
  employeeCode: string;
  designation: StaffType;
  /** Index 0 = day 1. null = not marked. */
  days: (AttendanceStatus | null)[];
  totals: AttendanceTotals;
};

export async function getMonthlyAttendance(
  ctx: TenantContext,
  input: { year: number; month: number; hostelId?: string | null },
) {
  requirePermission(ctx, "attendance.view");
  if (input.hostelId) assertHostelAccess(ctx, input.hostelId);
  const { year, month } = input;
  const dayCount = daysInMonth(year, month);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month - 1, dayCount));

  const staff = await prisma.staff.findMany({
    where: {
      ...staffScopeWhere(ctx, input.hostelId),
      joiningDate: { lte: end },
      // Include people archived during/after this month so history stays complete.
      OR: [{ archivedAt: null, status: { in: [...EMPLOYED_STATUSES] } }, { attendance: { some: { date: { gte: start, lte: end } } } }],
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true },
  });
  const records = await prisma.staffAttendance.findMany({
    where: { organizationId: ctx.organizationId, staffId: { in: staff.map((s) => s.id) }, date: { gte: start, lte: end } },
    select: { staffId: true, date: true, status: true },
  });
  const grid = new Map<string, (AttendanceStatus | null)[]>(staff.map((s) => [s.id, Array.from({ length: dayCount }, () => null)]));
  for (const r of records) {
    const day = Math.round((r.date.getTime() - start.getTime()) / DAY);
    const row = grid.get(r.staffId);
    if (row && day >= 0 && day < dayCount) row[day] = r.status;
  }

  const rows: MonthlyAttendanceRow[] = staff.map((s) => {
    const days = grid.get(s.id)!;
    return {
      staffId: s.id,
      name: fullName(s),
      employeeCode: s.employeeCode,
      designation: s.designation,
      days,
      totals: summarizeAttendance(days.filter((d): d is AttendanceStatus => d !== null)),
    };
  });
  const overall = summarizeAttendance(records.map((r) => r.status));
  return { year, month, key: monthKey(year, month), dayCount, rows, overall };
}

/** Raw records for the REST API (?date= or ?month=). */
export async function listAttendanceRecords(
  ctx: TenantContext,
  input: { from: Date; to: Date; hostelId?: string | null },
) {
  requirePermission(ctx, "attendance.view");
  if (input.hostelId) assertHostelAccess(ctx, input.hostelId);
  const rows = await prisma.staffAttendance.findMany({
    where: {
      organizationId: ctx.organizationId,
      date: { gte: input.from, lte: input.to },
      staff: staffScopeWhere(ctx, input.hostelId),
    },
    orderBy: [{ date: "asc" }, { staff: { firstName: "asc" } }],
    take: 20_000,
    select: {
      id: true,
      staffId: true,
      hostelId: true,
      date: true,
      status: true,
      checkInTime: true,
      checkOutTime: true,
      notes: true,
      updatedAt: true,
      staff: { select: { firstName: true, lastName: true, employeeCode: true } },
    },
  });
  return serialize(rows);
}
