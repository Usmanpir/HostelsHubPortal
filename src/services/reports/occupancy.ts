import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { BedStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { computeOccupancy, getOccupancy, type OccupancyStats } from "@/services/hostel/occupancy";
import { roomStatusLabels, roomStatusTones, roomTypeLabels } from "@/config/labels";
import type { ReportImpl } from "./definition";
import { occupancyTrend } from "./occupancy-trend";
import { hostelSql, reportHostelIds, reportScope } from "./shared";
import type { ReportColumn, ReportRow } from "./types";

const occupancyColumns: ReportColumn[] = [
  { key: "beds", header: "Beds", format: "number", align: "end" },
  { key: "occupied", header: "Occupied", format: "number", align: "end" },
  { key: "available", header: "Available", format: "number", align: "end" },
  { key: "reserved", header: "Reserved", format: "number", align: "end", hideOnMobile: true },
  { key: "maintenance", header: "Maintenance", format: "number", align: "end", hideOnMobile: true },
  { key: "rate", header: "Occupancy", format: "percent", align: "end" },
];

function statsRow(id: string, s: OccupancyStats): ReportRow {
  return {
    id,
    beds: s.totalBeds,
    occupied: s.occupiedBeds,
    available: s.availableBeds,
    reserved: s.reservedBeds,
    maintenance: s.maintenanceBeds,
    rate: s.occupancyRate,
  };
}

export const occupancyReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const [occupancy, trend, floorRows] = await Promise.all([
      getOccupancy(ctx, f.hostelId),
      occupancyTrend(ctx.organizationId, ids, f.from, f.to, f.today),
      prisma.$queryRaw<{ floorId: string; floorName: string; hostelName: string; status: BedStatus; count: number }[]>(Prisma.sql`
        SELECT fl."id" AS "floorId", fl."name" AS "floorName", h."name" AS "hostelName", b."status", count(*)::int AS count
        FROM "Bed" b
        JOIN "Room" r ON r."id" = b."roomId"
        JOIN "Floor" fl ON fl."id" = r."floorId"
        JOIN "Hostel" h ON h."id" = b."hostelId"
        WHERE b."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'b."hostelId"')}
          AND b."archivedAt" IS NULL AND r."archivedAt" IS NULL AND h."archivedAt" IS NULL
        GROUP BY fl."id", fl."name", fl."floorNumber", h."name", b."status"
        ORDER BY h."name", fl."floorNumber"
      `),
    ]);
    const hostels = await prisma.hostel.findMany({
      where: { organizationId: ctx.organizationId, id: { in: [...occupancy.byHostel.keys()] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const floors = new Map<string, { label: string; counts: Partial<Record<BedStatus, number>> }>();
    const multiHostel = hostels.length > 1;
    for (const r of floorRows) {
      const entry = floors.get(r.floorId) ?? { label: multiHostel ? `${r.hostelName} · ${r.floorName}` : r.floorName, counts: {} };
      entry.counts[r.status] = (entry.counts[r.status] ?? 0) + Number(r.count);
      floors.set(r.floorId, entry);
    }

    const o = occupancy.overall;
    return {
      note: `Live figures as of ${f.today}; trend shows occupied beds at each month end.`,
      stats: [
        { label: "Occupancy rate", value: o.occupancyRate, format: "percent", hint: "Occupied ÷ (total − maintenance − inactive)" },
        { label: "Total beds", value: o.totalBeds, format: "number" },
        { label: "Occupied beds", value: o.occupiedBeds, format: "number", tone: "info" },
        { label: "Available beds", value: o.availableBeds, format: "number", tone: "success" },
        { label: "Reserved beds", value: o.reservedBeds, format: "number" },
        { label: "Under maintenance", value: o.maintenanceBeds, format: "number", tone: o.maintenanceBeds ? "warning" : "default" },
      ],
      charts: [
        {
          id: "trend",
          title: "Occupancy trend",
          description: "Occupied beds vs total beds at month end",
          kind: "line",
          xKey: "month",
          xFormat: "month",
          format: "number",
          span: multiHostel ? "half" : "full",
          series: [
            { key: "occupied", label: "Occupied beds" },
            { key: "beds", label: "Total beds" },
          ],
          data: trend.map((t) => ({ month: t.month, occupied: t.occupied, beds: t.beds })),
        },
        ...(multiHostel
          ? [
              {
                id: "by-hostel",
                title: "Occupancy by hostel",
                kind: "bar" as const,
                xKey: "hostel",
                format: "percent" as const,
                span: "half" as const,
                series: [{ key: "rate", label: "Occupancy" }],
                data: hostels.map((h) => ({ hostel: h.name, rate: occupancy.byHostel.get(h.id)?.occupancyRate ?? 0 })),
              },
            ]
          : []),
      ],
      breakdowns: [
        {
          id: "hostels",
          title: "By hostel",
          columns: [{ key: "name", header: "Hostel", hrefKey: "href" }, ...occupancyColumns],
          rows: hostels.map((h) => ({
            ...statsRow(h.id, occupancy.byHostel.get(h.id) ?? computeOccupancy({})),
            name: h.name,
            href: `/hostels/${h.id}`,
          })),
          totals: { ...statsRow("total", o), name: "Total", href: null },
        },
        {
          id: "floors",
          title: "By floor",
          columns: [{ key: "name", header: "Floor" }, ...occupancyColumns],
          rows: [...floors].map(([id, fl]) => ({ ...statsRow(id, computeOccupancy(fl.counts)), name: fl.label })),
        },
      ],
    };
  },

  async rows(ctx, f, paging) {
    const where: Prisma.RoomWhereInput = { ...reportScope(ctx, f), archivedAt: null, hostel: { archivedAt: null } };
    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        where,
        orderBy: [{ hostel: { name: "asc" } }, { floor: { floorNumber: "asc" } }, { roomNumber: "asc" }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          roomNumber: true,
          roomType: true,
          status: true,
          hostel: { select: { name: true } },
          floor: { select: { name: true } },
        },
      }),
      prisma.room.count({ where }),
    ]);
    const counts = rooms.length
      ? await prisma.bed.groupBy({
          by: ["roomId", "status"],
          where: { organizationId: ctx.organizationId, roomId: { in: rooms.map((r) => r.id) }, archivedAt: null },
          _count: { _all: true },
        })
      : [];
    const byRoom = new Map<string, Partial<Record<BedStatus, number>>>();
    for (const c of counts) {
      const m = byRoom.get(c.roomId) ?? {};
      m[c.status] = c._count._all;
      byRoom.set(c.roomId, m);
    }
    return {
      title: "Rooms",
      total,
      columns: [
        { key: "room", header: "Room", hrefKey: "href", subKey: "type" },
        { key: "hostel", header: "Hostel" },
        { key: "floor", header: "Floor", hideOnMobile: true },
        ...occupancyColumns,
        { key: "status", header: "Status", format: "badge", labels: roomStatusLabels, tones: roomStatusTones },
      ],
      rows: rooms.map((r) => ({
        ...statsRow(r.id, computeOccupancy(byRoom.get(r.id) ?? {})),
        room: `Room ${r.roomNumber}`,
        type: roomTypeLabels[r.roomType],
        href: `/hostels/rooms/${r.id}`,
        hostel: r.hostel.name,
        floor: r.floor.name,
        status: r.status,
      })),
    };
  },
};
