import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hostelSql } from "./shared";

export type OccupancyTrendPoint = { month: string; occupied: number; beds: number; rate: number };

/**
 * Occupied beds at each month end (or today for the current month),
 * reconstructed from assignment check-in/check-out intervals, against the
 * beds that existed at that time. One query using generate_series.
 */
export async function occupancyTrend(
  organizationId: string,
  hostelIds: string[] | undefined,
  from: string,
  to: string,
  today: string,
): Promise<OccupancyTrendPoint[]> {
  const rows = await prisma.$queryRaw<{ month: string; occupied: number; beds: number }[]>(Prisma.sql`
    WITH months AS (
      SELECT to_char(m, 'YYYY-MM') AS month,
             LEAST((m + interval '1 month' - interval '1 day')::date, ${today}::date) AS at
      FROM generate_series(
        date_trunc('month', ${from}::timestamp),
        date_trunc('month', ${to}::timestamp),
        interval '1 month'
      ) AS m
    )
    SELECT months.month,
      (SELECT count(*)::int FROM "ResidentAssignment" a
        WHERE a."organizationId" = ${organizationId} ${hostelSql(hostelIds, 'a."hostelId"')}
          AND a."status" IN ('ACTIVE', 'TRANSFERRED', 'COMPLETED')
          AND a."checkInDate" <= months.at
          AND (a."checkOutDate" IS NULL OR a."checkOutDate" > months.at)) AS occupied,
      (SELECT count(*)::int FROM "Bed" b
        WHERE b."organizationId" = ${organizationId} ${hostelSql(hostelIds, 'b."hostelId"')}
          AND b."status" <> 'INACTIVE'
          AND b."createdAt" < (months.at + 1)::timestamp
          AND (b."archivedAt" IS NULL OR b."archivedAt" >= (months.at + 1)::timestamp)) AS beds
    FROM months
    ORDER BY months.month
  `);
  return rows.map((r) => {
    const occupied = Number(r.occupied);
    const beds = Number(r.beds);
    return { month: r.month, occupied, beds, rate: beds > 0 ? Math.round((occupied / beds) * 1000) / 10 : 0 };
  });
}
