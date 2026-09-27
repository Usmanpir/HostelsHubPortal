import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { staffStatusLabels, staffStatusTones, staffTypeLabels } from "@/config/labels";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { buckets, dateWhere, fillBuckets, pct, reportHostelIds, staffScope, staffSql, type ReportFilters } from "./shared";

type Counts = Record<AttendanceStatus, number>;
const ZERO: Counts = { PRESENT: 0, LATE: 0, HALF_DAY: 0, ABSENT: 0, LEAVE: 0 };

/** Attendance rate = (present + late + ½ half-day) ÷ working days marked (leave excluded). */
export function attendanceRate(c: Counts) {
  const worked = c.PRESENT + c.LATE + c.HALF_DAY * 0.5;
  const expected = c.PRESENT + c.LATE + c.HALF_DAY + c.ABSENT;
  return pct(worked, expected);
}

function attendanceWhere(ctx: TenantContext, f: ReportFilters): Prisma.StaffAttendanceWhereInput {
  return { organizationId: ctx.organizationId, date: dateWhere(f), staff: staffScope(ctx, f) };
}

export const staffAttendanceReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const b = buckets(f);
    const [byStatus, staffMarked, series] = await Promise.all([
      prisma.staffAttendance.groupBy({ by: ["status"], where: attendanceWhere(ctx, f), _count: { _all: true } }),
      prisma.staffAttendance.groupBy({ by: ["staffId"], where: attendanceWhere(ctx, f) }),
      prisma.$queryRaw<{ period: string; status: AttendanceStatus; count: number }[]>(Prisma.sql`
        SELECT to_char(sa."date", ${b.fmt}) AS period, sa."status", count(*)::int AS count
        FROM "StaffAttendance" sa
        WHERE sa."organizationId" = ${ctx.organizationId} ${staffSql(ids, 'sa."staffId"')}
          AND sa."date" BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY 1, 2
      `),
    ]);
    const totals: Counts = { ...ZERO };
    for (const r of byStatus) totals[r.status] = r._count._all;
    const periods = new Map<string, Counts>();
    for (const r of series) {
      const c = periods.get(r.period) ?? { ...ZERO };
      c[r.status] = Number(r.count);
      periods.set(r.period, c);
    }
    return {
      stats: [
        { label: "Attendance rate", value: attendanceRate(totals), format: "percent", hint: "(Present + late + ½ half-day) ÷ working days marked" },
        { label: "Staff marked", value: staffMarked.length, format: "number" },
        { label: "Days present", value: totals.PRESENT + totals.LATE, format: "number", tone: "success" },
        { label: "Late arrivals", value: totals.LATE, format: "number", tone: totals.LATE ? "warning" : "default" },
        { label: "Absences", value: totals.ABSENT, format: "number", tone: totals.ABSENT ? "danger" : "default" },
        { label: "Leave days", value: totals.LEAVE, format: "number" },
      ],
      charts: [
        {
          id: "daily",
          title: `Attendance per ${b.label}`,
          kind: "stacked",
          xKey: "period",
          xFormat: b.xFormat,
          format: "number",
          series: [
            { key: "PRESENT", label: "Present" },
            { key: "LATE", label: "Late" },
            { key: "HALF_DAY", label: "Half day" },
            { key: "ABSENT", label: "Absent" },
            { key: "LEAVE", label: "Leave" },
          ],
          data: fillBuckets(b.keys, periods, { ...ZERO }),
        },
      ],
      breakdowns: [],
    };
  },

  async rows(ctx, f, paging) {
    const where: Prisma.StaffWhereInput = {
      ...staffScope(ctx, f),
      OR: [{ status: { in: ["ACTIVE", "ON_LEAVE"] }, archivedAt: null }, { attendance: { some: { date: dateWhere(f) } } }],
    };
    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        skip: paging.skip,
        take: paging.take,
        select: { id: true, employeeCode: true, firstName: true, lastName: true, designation: true, status: true },
      }),
      prisma.staff.count({ where }),
    ]);
    const counts = staff.length
      ? await prisma.staffAttendance.groupBy({
          by: ["staffId", "status"],
          where: { organizationId: ctx.organizationId, staffId: { in: staff.map((s) => s.id) }, date: dateWhere(f) },
          _count: { _all: true },
        })
      : [];
    const byStaff = new Map<string, Counts>();
    for (const c of counts) {
      const m = byStaff.get(c.staffId) ?? { ...ZERO };
      m[c.status] = c._count._all;
      byStaff.set(c.staffId, m);
    }
    return {
      title: "Attendance by staff member",
      total,
      columns: [
        { key: "name", header: "Staff member", hrefKey: "href", subKey: "code" },
        { key: "designation", header: "Role", hideOnMobile: true },
        { key: "status", header: "Status", format: "badge", labels: staffStatusLabels, tones: staffStatusTones, hideOnMobile: true },
        { key: "present", header: "Present", format: "number", align: "end" },
        { key: "late", header: "Late", format: "number", align: "end", hideOnMobile: true },
        { key: "halfDay", header: "Half day", format: "number", align: "end", hideOnMobile: true },
        { key: "absent", header: "Absent", format: "number", align: "end" },
        { key: "leave", header: "Leave", format: "number", align: "end", hideOnMobile: true },
        { key: "marked", header: "Days marked", format: "number", align: "end", defaultHidden: true },
        { key: "rate", header: "Attendance", format: "percent", align: "end" },
      ],
      rows: staff.map((s) => {
        const c = byStaff.get(s.id) ?? { ...ZERO };
        const marked = c.PRESENT + c.LATE + c.HALF_DAY + c.ABSENT + c.LEAVE;
        return {
          id: s.id,
          name: `${s.firstName} ${s.lastName}`.trim(),
          code: s.employeeCode,
          href: `/staff/${s.id}`,
          designation: staffTypeLabels[s.designation],
          status: s.status,
          present: c.PRESENT,
          late: c.LATE,
          halfDay: c.HALF_DAY,
          absent: c.ABSENT,
          leave: c.LEAVE,
          marked,
          rate: marked ? attendanceRate(c) : null,
        };
      }),
    };
  },
};
