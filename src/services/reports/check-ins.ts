import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { assignmentStatusLabels, assignmentStatusTones } from "@/config/labels";
import type { ReportImpl } from "./definition";
import { buckets, dateWhere, fillBuckets, hostelSql, isoDate, nameOf, reportHostelIds, reportScope, type ReportFilters } from "./shared";
import type { TenantContext } from "@/lib/tenant/context";

function where(ctx: TenantContext, f: ReportFilters): Prisma.ResidentAssignmentWhereInput {
  return { ...reportScope(ctx, f), status: { not: "CANCELLED" }, checkInDate: dateWhere(f) };
}

export const checkInsReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const b = buckets(f);
    const [newCount, transfers, reserved, rent, series] = await Promise.all([
      prisma.residentAssignment.count({ where: { ...where(ctx, f), previousAssignmentId: null } }),
      prisma.residentAssignment.count({ where: { ...where(ctx, f), previousAssignmentId: { not: null } } }),
      prisma.residentAssignment.count({ where: { ...where(ctx, f), status: "RESERVED" } }),
      prisma.residentAssignment.aggregate({ where: { ...where(ctx, f), previousAssignmentId: null }, _avg: { monthlyRent: true } }),
      prisma.$queryRaw<{ period: string; checkins: number; transfers: number }[]>(Prisma.sql`
        SELECT to_char(a."checkInDate", ${b.fmt}) AS period,
               count(*) FILTER (WHERE a."previousAssignmentId" IS NULL)::int AS checkins,
               count(*) FILTER (WHERE a."previousAssignmentId" IS NOT NULL)::int AS transfers
        FROM "ResidentAssignment" a
        WHERE a."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'a."hostelId"')}
          AND a."status" <> 'CANCELLED'
          AND a."checkInDate" BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY 1
      `),
    ]);
    return {
      stats: [
        { label: "New check-ins", value: newCount, format: "number", tone: "success" },
        { label: "Transfers", value: transfers, format: "number", tone: "info", hint: "Bed or hostel changes" },
        { label: "Reservations", value: reserved, format: "number", hint: "Not yet moved in" },
        { label: "Average rent", value: rent._avg.monthlyRent === null ? null : round2(toNumber(rent._avg.monthlyRent)), format: "money", hint: "New check-ins" },
      ],
      charts: [
        {
          id: "trend",
          title: `Check-ins per ${b.label}`,
          kind: "stacked",
          xKey: "period",
          xFormat: b.xFormat,
          format: "number",
          series: [
            { key: "checkins", label: "New check-ins" },
            { key: "transfers", label: "Transfers" },
          ],
          data: fillBuckets(b.keys, new Map(series.map((s) => [s.period, { checkins: Number(s.checkins), transfers: Number(s.transfers) }])), {
            checkins: 0,
            transfers: 0,
          }),
        },
      ],
      breakdowns: [],
    };
  },

  async rows(ctx, f, paging) {
    const w = where(ctx, f);
    const [rows, total] = await Promise.all([
      prisma.residentAssignment.findMany({
        where: w,
        orderBy: [{ checkInDate: "desc" }, { createdAt: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          checkInDate: true,
          checkOutDate: true,
          status: true,
          monthlyRent: true,
          securityDeposit: true,
          previousAssignmentId: true,
          resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
          hostel: { select: { name: true } },
          room: { select: { roomNumber: true } },
          bed: { select: { bedNumber: true } },
          createdBy: { select: { name: true } },
        },
      }),
      prisma.residentAssignment.count({ where: w }),
    ]);
    return {
      title: "Assignments started in the period",
      total,
      columns: [
        { key: "date", header: "Check-in date", format: "date" },
        { key: "resident", header: "Resident", hrefKey: "href", subKey: "code" },
        { key: "hostel", header: "Hostel" },
        { key: "bed", header: "Room / bed" },
        { key: "kind", header: "Type", hideOnMobile: true },
        { key: "rent", header: "Monthly rent", format: "money", align: "end" },
        { key: "deposit", header: "Deposit", format: "money", align: "end", hideOnMobile: true },
        { key: "by", header: "Recorded by", defaultHidden: true },
        { key: "status", header: "Status", format: "badge", labels: assignmentStatusLabels, tones: assignmentStatusTones },
      ],
      rows: rows.map((a) => ({
        id: a.id,
        date: isoDate(a.checkInDate),
        resident: nameOf(a.resident),
        code: a.resident.residentCode,
        href: `/residents/${a.resident.id}`,
        hostel: a.hostel.name,
        bed: `Room ${a.room.roomNumber} · Bed ${a.bed.bedNumber}`,
        kind: a.previousAssignmentId ? "Transfer" : "Check-in",
        rent: round2(toNumber(a.monthlyRent)),
        deposit: round2(toNumber(a.securityDeposit)),
        by: a.createdBy?.name ?? null,
        status: a.status,
      })),
    };
  },
};
