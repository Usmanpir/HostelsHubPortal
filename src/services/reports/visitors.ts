import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { buckets, fillBuckets, hostelSql, iso, nameOf, reportHostelIds, reportScope, sqlTimestamp, timestampWhere, type ReportFilters } from "./shared";
import { daysBetween } from "./range";

function where(ctx: TenantContext, f: ReportFilters): Prisma.VisitorWhereInput {
  return { ...reportScope(ctx, f), checkInAt: timestampWhere(f) };
}

export const visitorsReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const b = buckets(f);
    const range = timestampWhere(f);
    const [total, inside, stats, series] = await Promise.all([
      prisma.visitor.count({ where: where(ctx, f) }),
      prisma.visitor.count({ where: { ...reportScope(ctx, f), checkOutAt: null } }),
      prisma.$queryRaw<{ unique: number; avgMinutes: number | null }[]>(Prisma.sql`
        SELECT count(DISTINCT lower(COALESCE(NULLIF(v."phone", ''), v."name")))::int AS "unique",
               AVG(EXTRACT(EPOCH FROM (v."checkOutAt" - v."checkInAt")) / 60) FILTER (WHERE v."checkOutAt" IS NOT NULL)::float8 AS "avgMinutes"
        FROM "Visitor" v
        WHERE v."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'v."hostelId"')}
          AND v."checkInAt" >= ${sqlTimestamp(range.gte)} AND v."checkInAt" < ${sqlTimestamp(range.lt)}
      `),
      prisma.$queryRaw<{ period: string; count: number }[]>(Prisma.sql`
        SELECT to_char((v."checkInAt" AT TIME ZONE 'UTC') AT TIME ZONE ${f.timezone}, ${b.fmt}) AS period, count(*)::int AS count
        FROM "Visitor" v
        WHERE v."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'v."hostelId"')}
          AND v."checkInAt" >= ${sqlTimestamp(range.gte)} AND v."checkInAt" < ${sqlTimestamp(range.lt)}
        GROUP BY 1
      `),
    ]);
    const days = daysBetween(f.from, f.to) + 1;
    const avgMinutes = stats[0]?.avgMinutes ?? null;
    return {
      stats: [
        { label: "Visits", value: total, format: "number" },
        { label: "Unique visitors", value: Number(stats[0]?.unique ?? 0), format: "number", hint: "By phone number or name" },
        { label: "Average per day", value: Math.round((total / Math.max(1, days)) * 10) / 10, format: "number" },
        { label: "Average visit", value: avgMinutes === null ? null : Math.round((avgMinutes / 60) * 10) / 10, format: "hours" },
        { label: "Inside right now", value: inside, format: "number", tone: inside ? "info" : "default", hint: "Not yet checked out" },
      ],
      charts: [
        {
          id: "trend",
          title: `Visitors per ${b.label}`,
          kind: "column",
          xKey: "period",
          xFormat: b.xFormat,
          format: "number",
          series: [{ key: "count", label: "Visits" }],
          data: fillBuckets(b.keys, new Map(series.map((s) => [s.period, { count: Number(s.count) }])), { count: 0 }),
        },
      ],
      breakdowns: [],
    };
  },

  async rows(ctx, f, paging) {
    const w = where(ctx, f);
    const [rows, total] = await Promise.all([
      prisma.visitor.findMany({
        where: w,
        orderBy: { checkInAt: "desc" },
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          name: true,
          phone: true,
          idNumber: true,
          purpose: true,
          checkInAt: true,
          checkOutAt: true,
          hostel: { select: { name: true } },
          resident: { select: { id: true, firstName: true, lastName: true } },
          recordedBy: { select: { name: true } },
        },
      }),
      prisma.visitor.count({ where: w }),
    ]);
    return {
      title: "Visitor log",
      total,
      columns: [
        { key: "name", header: "Visitor", subKey: "phone" },
        { key: "resident", header: "Visiting", hrefKey: "residentHref" },
        { key: "hostel", header: "Hostel", hideOnMobile: true },
        { key: "purpose", header: "Purpose", hideOnMobile: true },
        { key: "idNumber", header: "ID number", defaultHidden: true },
        { key: "checkIn", header: "Checked in", format: "datetime" },
        { key: "checkOut", header: "Checked out", format: "datetime", hideOnMobile: true },
        { key: "hours", header: "Duration", format: "hours", align: "end", hideOnMobile: true },
        { key: "recordedBy", header: "Recorded by", defaultHidden: true },
      ],
      rows: rows.map((v) => ({
        id: v.id,
        name: v.name,
        phone: v.phone,
        resident: nameOf(v.resident),
        residentHref: v.resident ? `/residents/${v.resident.id}` : null,
        hostel: v.hostel.name,
        purpose: v.purpose,
        idNumber: v.idNumber,
        checkIn: iso(v.checkInAt),
        checkOut: iso(v.checkOutAt),
        hours: v.checkOutAt ? Math.round(((v.checkOutAt.getTime() - v.checkInAt.getTime()) / 3_600_000) * 10) / 10 : null,
        recordedBy: v.recordedBy?.name ?? null,
      })),
    };
  },
};
