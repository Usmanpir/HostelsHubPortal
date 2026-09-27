import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ComplaintCategory, ComplaintStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { complaintCategoryLabels, complaintStatusLabels, complaintStatusTones, priorityLabels, priorityTones } from "@/config/labels";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { hostelSql, iso, nameOf, pct, reportHostelIds, reportScope, sqlTimestamp, timestampWhere, type ReportFilters } from "./shared";

function where(ctx: TenantContext, f: ReportFilters): Prisma.ComplaintWhereInput {
  return {
    ...reportScope(ctx, f),
    createdAt: timestampWhere(f),
    ...(f.status ? { status: f.status as ComplaintStatus } : {}),
  };
}

const OPEN_STATUSES: ComplaintStatus[] = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS"];

export const complaintsReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const w = where(ctx, f);
    const range = timestampWhere(f);
    const statusSql = f.status ? Prisma.sql`AND c."status" = ${f.status}::"ComplaintStatus"` : Prisma.empty;
    const [byStatus, byCategory, openNow, resolution] = await Promise.all([
      prisma.complaint.groupBy({ by: ["status"], where: w, _count: { _all: true } }),
      prisma.complaint.groupBy({ by: ["category"], where: w, _count: { _all: true } }),
      prisma.complaint.count({ where: { ...reportScope(ctx, f), status: { in: OPEN_STATUSES } } }),
      prisma.$queryRaw<{ avg: number | null }[]>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (c."resolvedAt" - c."createdAt")) / 3600)::float8 AS avg
        FROM "Complaint" c
        WHERE c."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'c."hostelId"')} ${statusSql}
          AND c."status" IN ('RESOLVED', 'CLOSED') AND c."resolvedAt" IS NOT NULL
          AND c."createdAt" >= ${sqlTimestamp(range.gte)} AND c."createdAt" < ${sqlTimestamp(range.lt)}
      `),
    ]);
    const total = byStatus.reduce((s, r) => s + r._count._all, 0);
    const count = (s: ComplaintStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const resolved = count("RESOLVED") + count("CLOSED");
    const avg = resolution[0]?.avg ?? null;
    const categories = byCategory
      .map((c) => ({ id: c.category, name: complaintCategoryLabels[c.category as ComplaintCategory], count: c._count._all }))
      .sort((a, b) => b.count - a.count);
    return {
      stats: [
        { label: "Complaints received", value: total, format: "number" },
        { label: "Resolved", value: resolved, format: "number", tone: "success", hint: `${pct(resolved, total)}% resolution rate` },
        { label: "Open right now", value: openNow, format: "number", tone: openNow ? "warning" : "default", hint: "All open complaints, any date" },
        { label: "Avg. resolution time", value: avg === null ? null : Math.round(avg * 10) / 10, format: "hours" },
        { label: "Top category", value: categories[0]?.count ?? null, format: "number", hint: categories[0]?.name ?? "No complaints" },
      ],
      charts: [
        {
          id: "category",
          title: "By category",
          kind: "bar",
          xKey: "name",
          format: "number",
          span: "half",
          series: [{ key: "count", label: "Complaints" }],
          data: categories.map((c) => ({ name: c.name, count: c.count })),
        },
        {
          id: "status",
          title: "By status",
          kind: "bar",
          xKey: "name",
          format: "number",
          span: "half",
          series: [{ key: "count", label: "Complaints" }],
          data: (Object.keys(complaintStatusLabels) as ComplaintStatus[]).map((s) => ({ name: complaintStatusLabels[s], count: count(s) })),
        },
      ],
      breakdowns: [
        {
          id: "category",
          title: "By category",
          columns: [
            { key: "name", header: "Category" },
            { key: "count", header: "Complaints", format: "number", align: "end" },
            { key: "share", header: "Share", format: "percent", align: "end" },
          ],
          rows: categories.map((c) => ({ id: c.id, name: c.name, count: c.count, share: pct(c.count, total) })),
          totals: { id: "total", name: "Total", count: total, share: total ? 100 : 0 },
        },
      ],
    };
  },

  async rows(ctx, f, paging) {
    const w = where(ctx, f);
    const [rows, total] = await Promise.all([
      prisma.complaint.findMany({
        where: w,
        orderBy: { createdAt: "desc" },
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          complaintNumber: true,
          title: true,
          category: true,
          priority: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
          hostel: { select: { name: true } },
          resident: { select: { firstName: true, lastName: true } },
          assignedStaff: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.complaint.count({ where: w }),
    ]);
    return {
      title: "Complaints",
      total,
      columns: [
        { key: "title", header: "Complaint", hrefKey: "href", subKey: "number" },
        { key: "resident", header: "Resident", hideOnMobile: true },
        { key: "hostel", header: "Hostel", hideOnMobile: true },
        { key: "category", header: "Category", format: "badge", labels: complaintCategoryLabels, hideOnMobile: true },
        { key: "priority", header: "Priority", format: "badge", labels: priorityLabels, tones: priorityTones, hideOnMobile: true },
        { key: "status", header: "Status", format: "badge", labels: complaintStatusLabels, tones: complaintStatusTones },
        { key: "assignee", header: "Assigned to", defaultHidden: true },
        { key: "createdAt", header: "Submitted", format: "datetime" },
        { key: "resolvedAt", header: "Resolved", format: "datetime", defaultHidden: true },
        { key: "hours", header: "Resolution", format: "hours", align: "end", hideOnMobile: true },
      ],
      rows: rows.map((c) => ({
        id: c.id,
        title: c.title,
        number: c.complaintNumber,
        href: `/operations/complaints/${c.id}`,
        resident: nameOf(c.resident),
        hostel: c.hostel.name,
        category: c.category,
        priority: c.priority,
        status: c.status,
        assignee: nameOf(c.assignedStaff),
        createdAt: iso(c.createdAt),
        resolvedAt: iso(c.resolvedAt),
        hours: c.resolvedAt ? Math.round(((c.resolvedAt.getTime() - c.createdAt.getTime()) / 3_600_000) * 10) / 10 : null,
      })),
    };
  },
};
