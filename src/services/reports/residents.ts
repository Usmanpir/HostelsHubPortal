import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ResidentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { residentStatusLabels, residentStatusTones } from "@/config/labels";
import type { ReportImpl } from "./definition";
import { dateWhere, fillMonths, hostelSql, isoDate, reportHostelIds, reportScope, type ReportFilters } from "./shared";

function statusWhere(f: ReportFilters) {
  return f.status ? { status: f.status as ResidentStatus } : {};
}

export const residentsReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const statusSql = f.status ? Prisma.sql`AND r."status" = ${f.status}::"ResidentStatus"` : Prisma.empty;
    const [byStatus, joined, monthly] = await Promise.all([
      prisma.resident.groupBy({ by: ["status"], where: reportScope(ctx, f), _count: { _all: true } }),
      prisma.resident.count({ where: { ...reportScope(ctx, f), ...statusWhere(f), joiningDate: dateWhere(f) } }),
      prisma.$queryRaw<{ month: string; count: number }[]>(Prisma.sql`
        SELECT to_char(r."joiningDate", 'YYYY-MM') AS month, count(*)::int AS count
        FROM "Resident" r
        WHERE r."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'r."hostelId"')} ${statusSql}
          AND r."joiningDate" BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY 1
      `),
    ]);
    const count = (s: ResidentStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const onRecord = byStatus.reduce((s, b) => s + b._count._all, 0);
    const statuses = Object.keys(residentStatusLabels) as ResidentStatus[];
    return {
      stats: [
        { label: "Joined in period", value: joined, format: "number", tone: "info" },
        { label: "Active", value: count("ACTIVE"), format: "number", tone: "success" },
        { label: "On notice", value: count("NOTICE"), format: "number", tone: count("NOTICE") ? "warning" : "default" },
        { label: "Checked out", value: count("CHECKED_OUT"), format: "number" },
        { label: "Total on record", value: onRecord, format: "number", hint: "Includes archived residents" },
      ],
      charts: [
        {
          id: "joined",
          title: "New residents per month",
          kind: "column",
          xKey: "month",
          xFormat: "month",
          format: "number",
          span: "half",
          series: [{ key: "count", label: "Joined" }],
          data: fillMonths(f, new Map(monthly.map((m) => [m.month, { count: Number(m.count) }])), { count: 0 }),
        },
        {
          id: "status",
          title: "Residents by status",
          description: "All residents on record",
          kind: "bar",
          xKey: "status",
          format: "number",
          span: "half",
          series: [{ key: "count", label: "Residents" }],
          data: statuses.map((s) => ({ status: residentStatusLabels[s], count: count(s) })),
        },
      ],
      breakdowns: [],
    };
  },

  async rows(ctx, f, paging) {
    const where: Prisma.ResidentWhereInput = { ...reportScope(ctx, f), ...statusWhere(f), joiningDate: dateWhere(f) };
    const [residents, total] = await Promise.all([
      prisma.resident.findMany({
        where,
        orderBy: [{ joiningDate: "desc" }, { lastName: "asc" }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          residentCode: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          joiningDate: true,
          actualLeavingDate: true,
          institution: true,
          occupation: true,
          hostel: { select: { name: true } },
          assignments: {
            where: { status: "ACTIVE" },
            take: 1,
            select: { room: { select: { roomNumber: true } }, bed: { select: { bedNumber: true } } },
          },
        },
      }),
      prisma.resident.count({ where }),
    ]);
    return {
      title: "Residents who joined in the period",
      total,
      columns: [
        { key: "name", header: "Resident", hrefKey: "href", subKey: "code" },
        { key: "hostel", header: "Hostel" },
        { key: "bed", header: "Current bed", hideOnMobile: true },
        { key: "phone", header: "Phone", hideOnMobile: true },
        { key: "affiliation", header: "Institution / work", defaultHidden: true },
        { key: "joiningDate", header: "Joined", format: "date" },
        { key: "leavingDate", header: "Left", format: "date", hideOnMobile: true },
        { key: "status", header: "Status", format: "badge", labels: residentStatusLabels, tones: residentStatusTones },
      ],
      rows: residents.map((r) => {
        const a = r.assignments[0];
        return {
          id: r.id,
          name: `${r.firstName} ${r.lastName}`.trim(),
          code: r.residentCode,
          href: `/residents/${r.id}`,
          hostel: r.hostel.name,
          bed: a ? `Room ${a.room.roomNumber} · Bed ${a.bed.bedNumber}` : null,
          phone: r.phone,
          affiliation: r.institution ?? r.occupation ?? null,
          joiningDate: isoDate(r.joiningDate),
          leavingDate: isoDate(r.actualLeavingDate),
          status: r.status,
        };
      }),
    };
  },
};
