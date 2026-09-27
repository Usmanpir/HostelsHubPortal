import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { can, type TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { buckets, dateWhere, fillBuckets, hostelSql, isoDate, nameOf, reportHostelIds, reportScope, type ReportFilters } from "./shared";
import type { ReportColumn, ReportStat } from "./types";

function where(ctx: TenantContext, f: ReportFilters): Prisma.ResidentAssignmentWhereInput {
  return { ...reportScope(ctx, f), status: "COMPLETED", checkOutDate: dateWhere(f) };
}

export const checkOutsReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const b = buckets(f);
    const financial = can(ctx, "reports.financial");
    const [agg, stay, series] = await Promise.all([
      prisma.residentAssignment.aggregate({
        where: where(ctx, f),
        _count: { _all: true },
        _sum: { depositRefund: true, depositDeduction: true, finalCharges: true, securityDeposit: true },
      }),
      prisma.$queryRaw<{ avg: number | null }[]>(Prisma.sql`
        SELECT AVG(a."checkOutDate" - a."checkInDate")::float8 AS avg
        FROM "ResidentAssignment" a
        WHERE a."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'a."hostelId"')}
          AND a."status" = 'COMPLETED'
          AND a."checkOutDate" BETWEEN ${f.from}::date AND ${f.to}::date
      `),
      prisma.$queryRaw<{ period: string; count: number }[]>(Prisma.sql`
        SELECT to_char(a."checkOutDate", ${b.fmt}) AS period, count(*)::int AS count
        FROM "ResidentAssignment" a
        WHERE a."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'a."hostelId"')}
          AND a."status" = 'COMPLETED'
          AND a."checkOutDate" BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY 1
      `),
    ]);
    const avgStay = stay[0]?.avg ?? null;
    const stats: ReportStat[] = [
      { label: "Check-outs", value: agg._count._all, format: "number" },
      { label: "Average stay", value: avgStay === null ? null : Math.round(avgStay), format: "days" },
    ];
    if (financial) {
      stats.push(
        { label: "Deposits held", value: round2(toNumber(agg._sum.securityDeposit)), format: "money" },
        { label: "Deposit refunds", value: round2(toNumber(agg._sum.depositRefund)), format: "money", tone: "info" },
        { label: "Deductions", value: round2(toNumber(agg._sum.depositDeduction)), format: "money", tone: "warning" },
        { label: "Final charges", value: round2(toNumber(agg._sum.finalCharges)), format: "money" },
      );
    }
    return {
      stats,
      charts: [
        {
          id: "trend",
          title: `Check-outs per ${b.label}`,
          kind: "column",
          xKey: "period",
          xFormat: b.xFormat,
          format: "number",
          series: [{ key: "count", label: "Check-outs" }],
          data: fillBuckets(b.keys, new Map(series.map((s) => [s.period, { count: Number(s.count) }])), { count: 0 }),
        },
      ],
      breakdowns: [],
    };
  },

  async rows(ctx, f, paging) {
    const w = where(ctx, f);
    const financial = can(ctx, "reports.financial");
    const [rows, total] = await Promise.all([
      prisma.residentAssignment.findMany({
        where: w,
        orderBy: [{ checkOutDate: "desc" }, { updatedAt: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          checkInDate: true,
          checkOutDate: true,
          securityDeposit: true,
          depositDeduction: true,
          depositRefund: true,
          finalCharges: true,
          endReason: true,
          resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
          hostel: { select: { name: true } },
          room: { select: { roomNumber: true } },
          bed: { select: { bedNumber: true } },
        },
      }),
      prisma.residentAssignment.count({ where: w }),
    ]);
    const columns: ReportColumn[] = [
      { key: "date", header: "Check-out date", format: "date" },
      { key: "resident", header: "Resident", hrefKey: "href", subKey: "code" },
      { key: "hostel", header: "Hostel" },
      { key: "bed", header: "Room / bed", hideOnMobile: true },
      { key: "checkIn", header: "Checked in", format: "date", hideOnMobile: true },
      { key: "stay", header: "Stay", format: "days", align: "end" },
    ];
    if (financial) {
      columns.push(
        { key: "deposit", header: "Deposit", format: "money", align: "end" },
        { key: "deduction", header: "Deduction", format: "money", align: "end" },
        { key: "refund", header: "Refund", format: "money", align: "end" },
        { key: "finalCharges", header: "Final charges", format: "money", align: "end", defaultHidden: true },
      );
    }
    columns.push({ key: "reason", header: "Reason", hideOnMobile: true });
    return {
      title: "Check-outs in the period",
      total,
      columns,
      rows: rows.map((a) => ({
        id: a.id,
        date: isoDate(a.checkOutDate),
        resident: nameOf(a.resident),
        code: a.resident.residentCode,
        href: `/residents/${a.resident.id}`,
        hostel: a.hostel.name,
        bed: `Room ${a.room.roomNumber} · Bed ${a.bed.bedNumber}`,
        checkIn: isoDate(a.checkInDate),
        stay: a.checkOutDate ? Math.max(0, Math.round((a.checkOutDate.getTime() - a.checkInDate.getTime()) / 86_400_000)) : null,
        deposit: financial ? round2(toNumber(a.securityDeposit)) : null,
        deduction: financial ? round2(toNumber(a.depositDeduction)) : null,
        refund: financial ? round2(toNumber(a.depositRefund)) : null,
        finalCharges: financial ? round2(toNumber(a.finalCharges)) : null,
        reason: a.endReason,
      })),
    };
  },
};
