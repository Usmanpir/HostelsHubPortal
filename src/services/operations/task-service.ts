import { prisma } from "@/lib/db/prisma";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { can, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { fullName, todayInTimeZone } from "@/lib/format";
import { serialize } from "@/lib/serialize";
import { listMyMaintenance } from "./maintenance-service";
import { listMyComplaints } from "./complaint-service";
import { listStaffAnnouncements } from "./announcement-service";

const ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "HALF_DAY", "LEAVE", "ABSENT"];

/** This month's attendance for the linked staff profile (date-only rows, UTC midnight). */
async function monthAttendance(ctx: TenantContext, staffId: string) {
  const today = todayInTimeZone(ctx.organization.timezone);
  const [year, month] = today.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const rows = await prisma.staffAttendance.findMany({
    where: { organizationId: ctx.organizationId, staffId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, notes: true, hostel: { select: { name: true } } },
  });
  const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<AttendanceStatus, number>;
  return {
    monthStart: start,
    today,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    rows,
    counts,
  };
}

/**
 * Everything on the "My tasks" page for a staff member. When the user has no
 * linked staff profile, `staff` is null and the page explains how to link it.
 */
export async function getMyTasks(ctx: TenantContext) {
  requirePermission(ctx, "tasks.view");
  const announcementsPromise = can(ctx, "announcements.view") ? listStaffAnnouncements(ctx, 5) : Promise.resolve([]);
  if (!ctx.staffId) {
    return { staff: null, maintenance: [], complaints: [], attendance: null, announcements: await announcementsPromise, canWorkMaintenance: false };
  }
  const staff = await prisma.staff.findFirst({
    where: { id: ctx.staffId, organizationId: ctx.organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      status: true,
      hostels: { select: { isPrimary: true, hostel: { select: { id: true, name: true } } } },
    },
  });
  if (!staff) {
    return { staff: null, maintenance: [], complaints: [], attendance: null, announcements: await announcementsPromise, canWorkMaintenance: false };
  }
  const [maintenance, complaints, attendance, announcements] = await Promise.all([
    can(ctx, "maintenance.work") || can(ctx, "maintenance.view") ? listMyMaintenance(ctx) : Promise.resolve([]),
    listMyComplaints(ctx),
    monthAttendance(ctx, staff.id),
    announcementsPromise,
  ]);
  return serialize({
    staff: { ...staff, name: fullName(staff) },
    maintenance,
    complaints,
    attendance,
    announcements,
    canWorkMaintenance: can(ctx, "maintenance.work") || can(ctx, "maintenance.manage"),
  });
}
