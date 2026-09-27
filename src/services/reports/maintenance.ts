import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { MaintenanceCategory, MaintenanceStatus, Priority } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { maintenanceCategoryLabels, maintenanceStatusLabels, maintenanceStatusTones, priorityLabels, priorityTones } from "@/config/labels";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { hostelSql, iso, nameOf, pct, reportHostelIds, reportScope, sqlTimestamp, timestampWhere, type ReportFilters } from "./shared";

function where(ctx: TenantContext, f: ReportFilters): Prisma.MaintenanceRequestWhereInput {
  return {
    ...reportScope(ctx, f),
    createdAt: timestampWhere(f),
    ...(f.status ? { status: f.status as MaintenanceStatus } : {}),
  };
}

const OPEN_STATUSES: MaintenanceStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS"];

export const maintenanceReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const w = where(ctx, f);
    const range = timestampWhere(f);
    const statusSql = f.status ? Prisma.sql`AND m."status" = ${f.status}::"MaintenanceStatus"` : Prisma.empty;
    const [byStatus, byCategory, byPriority, openNow, resolution] = await Promise.all([
      prisma.maintenanceRequest.groupBy({ by: ["status"], where: w, _count: { _all: true } }),
      prisma.maintenanceRequest.groupBy({ by: ["category"], where: w, _count: { _all: true } }),
      prisma.maintenanceRequest.groupBy({ by: ["priority"], where: w, _count: { _all: true } }),
      prisma.maintenanceRequest.count({ where: { ...reportScope(ctx, f), status: { in: OPEN_STATUSES } } }),
      prisma.$queryRaw<{ avg: number | null; count: number }[]>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (m."completedAt" - m."createdAt")) / 3600)::float8 AS avg, count(*)::int AS count
        FROM "MaintenanceRequest" m
        WHERE m."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'm."hostelId"')} ${statusSql}
          AND m."status" = 'COMPLETED' AND m."completedAt" IS NOT NULL
          AND m."createdAt" >= ${sqlTimestamp(range.gte)} AND m."createdAt" < ${sqlTimestamp(range.lt)}
      `),
    ]);
    const total = byStatus.reduce((s, r) => s + r._count._all, 0);
    const statusCount = (s: MaintenanceStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const avg = resolution[0]?.avg ?? null;
    const urgent = (byPriority.find((p) => p.priority === "URGENT")?._count._all ?? 0) + (byPriority.find((p) => p.priority === "HIGH")?._count._all ?? 0);
    return {
      stats: [
        { label: "Requests reported", value: total, format: "number" },
        { label: "Completed", value: statusCount("COMPLETED"), format: "number", tone: "success", hint: `${pct(statusCount("COMPLETED"), total)}% of reported` },
        { label: "Open right now", value: openNow, format: "number", tone: openNow ? "warning" : "default", hint: "All open requests, any date" },
        { label: "High / urgent", value: urgent, format: "number", tone: urgent ? "danger" : "default" },
        { label: "Avg. resolution time", value: avg === null ? null : Math.round(avg * 10) / 10, format: "hours" },
      ],
      charts: [
        {
          id: "category",
          title: "By category",
          kind: "bar",
          xKey: "name",
          format: "number",
          span: "half",
          series: [{ key: "count", label: "Requests" }],
          data: byCategory
            .map((c) => ({ name: maintenanceCategoryLabels[c.category as MaintenanceCategory], count: c._count._all }))
            .sort((a, b) => b.count - a.count),
        },
        {
          id: "status",
          title: "By status",
          kind: "bar",
          xKey: "name",
          format: "number",
          span: "half",
          series: [{ key: "count", label: "Requests" }],
          data: (Object.keys(maintenanceStatusLabels) as MaintenanceStatus[]).map((s) => ({ name: maintenanceStatusLabels[s], count: statusCount(s) })),
        },
      ],
      breakdowns: [
        {
          id: "priority",
          title: "By priority",
          columns: [
            { key: "name", header: "Priority" },
            { key: "count", header: "Requests", format: "number", align: "end" },
            { key: "share", header: "Share", format: "percent", align: "end" },
          ],
          rows: (["URGENT", "HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => {
            const count = byPriority.find((r) => r.priority === p)?._count._all ?? 0;
            return { id: p, name: priorityLabels[p], count, share: pct(count, total) };
          }),
          totals: { id: "total", name: "Total", count: total, share: total ? 100 : 0 },
        },
      ],
    };
  },

  async rows(ctx, f, paging) {
    const w = where(ctx, f);
    const [rows, total] = await Promise.all([
      prisma.maintenanceRequest.findMany({
        where: w,
        orderBy: { createdAt: "desc" },
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          requestNumber: true,
          title: true,
          category: true,
          priority: true,
          status: true,
          createdAt: true,
          completedAt: true,
          hostel: { select: { name: true } },
          room: { select: { roomNumber: true } },
          assignedStaff: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.maintenanceRequest.count({ where: w }),
    ]);
    return {
      title: "Maintenance requests",
      total,
      columns: [
        { key: "title", header: "Request", hrefKey: "href", subKey: "number" },
        { key: "hostel", header: "Hostel", hideOnMobile: true },
        { key: "room", header: "Room", hideOnMobile: true },
        { key: "category", header: "Category", format: "badge", labels: maintenanceCategoryLabels, hideOnMobile: true },
        { key: "priority", header: "Priority", format: "badge", labels: priorityLabels, tones: priorityTones },
        { key: "status", header: "Status", format: "badge", labels: maintenanceStatusLabels, tones: maintenanceStatusTones },
        { key: "assignee", header: "Assigned to", hideOnMobile: true },
        { key: "createdAt", header: "Reported", format: "datetime" },
        { key: "completedAt", header: "Completed", format: "datetime", defaultHidden: true },
        { key: "hours", header: "Resolution", format: "hours", align: "end", hideOnMobile: true },
      ],
      rows: rows.map((m) => ({
        id: m.id,
        title: m.title,
        number: m.requestNumber,
        href: `/operations/maintenance/${m.id}`,
        hostel: m.hostel.name,
        room: m.room ? `Room ${m.room.roomNumber}` : null,
        category: m.category,
        priority: m.priority,
        status: m.status,
        assignee: nameOf(m.assignedStaff),
        createdAt: iso(m.createdAt),
        completedAt: iso(m.completedAt),
        hours: m.completedAt ? Math.round(((m.completedAt.getTime() - m.createdAt.getTime()) / 3_600_000) * 10) / 10 : null,
      })),
    };
  },
};
