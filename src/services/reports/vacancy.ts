import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { roomTypeLabels } from "@/config/labels";
import type { ReportImpl } from "./definition";
import { hostelSql, reportHostelIds, reportScope } from "./shared";

const vacantBedWhere = { archivedAt: null, status: "AVAILABLE" as const, room: { archivedAt: null }, hostel: { archivedAt: null } };

export const vacancyReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const [byHostel, statusCounts] = await Promise.all([
      prisma.$queryRaw<{ hostelId: string; hostelName: string; beds: number; rent: number | null; noRent: number }[]>(Prisma.sql`
        SELECT h."id" AS "hostelId", h."name" AS "hostelName", count(*)::int AS beds,
               COALESCE(SUM(COALESCE(b."monthlyRent", r."rent", h."defaultBedRent")), 0)::float8 AS rent,
               count(*) FILTER (WHERE COALESCE(b."monthlyRent", r."rent", h."defaultBedRent") IS NULL)::int AS "noRent"
        FROM "Bed" b
        JOIN "Room" r ON r."id" = b."roomId"
        JOIN "Hostel" h ON h."id" = b."hostelId"
        WHERE b."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'b."hostelId"')}
          AND b."status" = 'AVAILABLE' AND b."archivedAt" IS NULL AND r."archivedAt" IS NULL AND h."archivedAt" IS NULL
        GROUP BY h."id", h."name"
        ORDER BY h."name"
      `),
      prisma.bed.groupBy({
        by: ["status"],
        where: { ...reportScope(ctx, f), archivedAt: null, room: { archivedAt: null }, hostel: { archivedAt: null } },
        _count: { _all: true },
      }),
    ]);
    const count = (s: string) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
    const vacant = byHostel.reduce((s, h) => s + Number(h.beds), 0);
    const potential = round2(byHostel.reduce((s, h) => s + toNumber(h.rent), 0));
    const withoutRent = byHostel.reduce((s, h) => s + Number(h.noRent), 0);
    return {
      note: `Point-in-time report as of ${f.today}.`,
      stats: [
        { label: "Available beds", value: vacant, format: "number", tone: "success" },
        { label: "Monthly rent at stake", value: potential, format: "money", hint: withoutRent ? `${withoutRent} bed(s) have no rent set` : "Sum of rent for vacant beds" },
        { label: "Average rent", value: vacant - withoutRent > 0 ? round2(potential / (vacant - withoutRent)) : null, format: "money" },
        { label: "Reserved beds", value: count("RESERVED"), format: "number" },
        { label: "Under maintenance", value: count("MAINTENANCE"), format: "number", tone: count("MAINTENANCE") ? "warning" : "default" },
      ],
      charts:
        byHostel.length > 1
          ? [
              {
                id: "by-hostel",
                title: "Available beds by hostel",
                kind: "bar",
                xKey: "hostel",
                format: "number",
                series: [{ key: "beds", label: "Available beds" }],
                data: byHostel.map((h) => ({ hostel: h.hostelName, beds: Number(h.beds) })),
              },
            ]
          : [],
      breakdowns: [
        {
          id: "hostels",
          title: "By hostel",
          columns: [
            { key: "name", header: "Hostel" },
            { key: "beds", header: "Available beds", format: "number", align: "end" },
            { key: "rent", header: "Monthly rent", format: "money", align: "end" },
          ],
          rows: byHostel.map((h) => ({ id: h.hostelId, name: h.hostelName, beds: Number(h.beds), rent: round2(toNumber(h.rent)) })),
          totals: { id: "total", name: "Total", beds: vacant, rent: potential },
        },
      ],
    };
  },

  async rows(ctx, f, paging) {
    const where: Prisma.BedWhereInput = { ...reportScope(ctx, f), ...vacantBedWhere };
    const [beds, total] = await Promise.all([
      prisma.bed.findMany({
        where,
        orderBy: [{ hostel: { name: "asc" } }, { room: { roomNumber: "asc" } }, { bedNumber: "asc" }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          bedNumber: true,
          monthlyRent: true,
          updatedAt: true,
          room: { select: { id: true, roomNumber: true, roomType: true, rent: true, floor: { select: { name: true } } } },
          hostel: { select: { name: true, defaultBedRent: true } },
        },
      }),
      prisma.bed.count({ where }),
    ]);
    return {
      title: "Available beds",
      total,
      columns: [
        { key: "bed", header: "Bed", hrefKey: "href", subKey: "roomType" },
        { key: "hostel", header: "Hostel" },
        { key: "floor", header: "Floor", hideOnMobile: true },
        { key: "rent", header: "Monthly rent", format: "money", align: "end" },
        { key: "since", header: "Last updated", format: "date", hideOnMobile: true },
      ],
      rows: beds.map((b) => {
        const rent = b.monthlyRent ?? b.room.rent ?? b.hostel.defaultBedRent;
        return {
          id: b.id,
          bed: `Room ${b.room.roomNumber} · Bed ${b.bedNumber}`,
          roomType: roomTypeLabels[b.room.roomType],
          href: `/hostels/rooms/${b.room.id}`,
          hostel: b.hostel.name,
          floor: b.room.floor.name,
          rent: rent === null ? null : round2(toNumber(rent)),
          since: b.updatedAt.toISOString(),
        };
      }),
    };
  },
};
