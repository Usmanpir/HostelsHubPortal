import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { dateOnly, todayInTimeZone } from "@/lib/format";
import { can, listHostelIds, requirePermission, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import { RECEIVABLE_STATUSES } from "@/services/finance/ledger";
import { getOccupancy, computeOccupancy, type OccupancyStats } from "@/services/hostel/occupancy";
import { occupancyTrend, type OccupancyTrendPoint } from "@/services/reports/occupancy-trend";
import { addDays, addMonths, dayKeys, endOfMonth, monthKeys, startOfMonth } from "@/services/reports/range";
import { hostelSql, staffScope } from "@/services/reports/shared";
import { getRecentActivity, type ActivityItem } from "./activity";

export type DashboardFinance = {
  billed: number;
  collected: number;
  expenses: number;
  /** Same days of the previous month, for deltas. */
  previous: { billed: number; collected: number; expenses: number };
};

export type DashboardSummary = {
  today: string;
  scope: { hostelId: string | null; hostelName: string | null };
  isEmpty: boolean;
  setup: { hostels: number; rooms: number; residents: number };
  kpis: {
    hostels: number;
    rooms: number;
    occupancy: OccupancyStats;
    activeResidents: number;
    activeStaff: number;
    /** Open + assigned + in-progress requests; null without maintenance.view. */
    openMaintenance: number | null;
  };
  finance: DashboardFinance | null;
  outstanding: { total: number; overdue: number; invoices: number } | null;
  charts: {
    occupancyTrend: OccupancyTrendPoint[];
    revenueTrend: { month: string; billed: number; collected: number }[] | null;
    collectionThisMonth: { day: string; collected: number }[] | null;
    expensesByCategory: { category: string; amount: number }[] | null;
    hostelComparison: { hostelId: string; hostel: string; occupancy: number; revenue: number | null }[] | null;
  };
  hostels: { id: string; name: string; code: string; occupancy: OccupancyStats }[];
  activity: ActivityItem[];
};

const signed = Prisma.sql`CASE WHEN p."type" = 'REFUND' THEN -p."amount" ELSE p."amount" END`;

async function financeTotals(ctx: TenantContext, ids: string[] | undefined, from: string, to: string) {
  const where = scopedWhere(ctx);
  const [billed, collected, expenses] = await Promise.all([
    prisma.invoice.aggregate({
      where: { ...where, status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: { gte: dateOnly(from), lte: dateOnly(to) } },
      _sum: { total: true },
    }),
    prisma.$queryRaw<{ net: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(${signed}), 0)::float8 AS net
      FROM "Payment" p
      WHERE p."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'p."hostelId"')}
        AND p."status" = 'COMPLETED' AND p."paymentDate" BETWEEN ${from}::date AND ${to}::date
    `),
    prisma.expense.aggregate({ where: { ...where, status: "RECORDED", date: { gte: dateOnly(from), lte: dateOnly(to) } }, _sum: { amount: true } }),
  ]);
  return {
    billed: round2(toNumber(billed._sum.total)),
    collected: round2(Number(collected[0]?.net ?? 0)),
    expenses: round2(toNumber(expenses._sum.amount)),
  };
}

/**
 * Everything the owner dashboard shows, scoped to the header hostel switcher.
 * Financial sections are only computed for members allowed to see them.
 */
export async function getDashboardSummary(ctx: TenantContext): Promise<DashboardSummary> {
  requirePermission(ctx, "dashboard.view");
  const ids = listHostelIds(ctx);
  const where = scopedWhere(ctx);
  const today = todayInTimeZone(ctx.organization.timezone || "UTC");
  const monthStart = startOfMonth(today);
  const trendFrom = addMonths(today, -11);
  const financial = can(ctx, "reports.financial");
  const canOutstanding = financial || can(ctx, "invoices.view");
  const hostelWhere: Prisma.HostelWhereInput = { organizationId: ctx.organizationId, archivedAt: null, ...(ids ? { id: { in: ids } } : {}) };

  const [hostelRows, rooms, residentsOnRecord, activeResidents, activeStaff, openMaintenance, occupancy, trend] = await Promise.all([
    prisma.hostel.findMany({ where: hostelWhere, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.room.count({ where: { ...where, archivedAt: null, hostel: { archivedAt: null } } }),
    prisma.resident.count({ where }),
    prisma.resident.count({ where: { ...where, status: { in: ["ACTIVE", "NOTICE"] } } }),
    prisma.staff.count({ where: { ...staffScope(ctx, { hostelId: null }), status: "ACTIVE", archivedAt: null } }),
    can(ctx, "maintenance.view")
      ? prisma.maintenanceRequest.count({ where: { ...where, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } } })
      : Promise.resolve(null),
    getOccupancy(ctx),
    occupancyTrend(ctx.organizationId, ids, trendFrom, today, today),
  ]);

  const activeHostel = ctx.activeHostelId ? (hostelRows.find((h) => h.id === ctx.activeHostelId) ?? null) : null;
  const compare = !ctx.activeHostelId && hostelRows.length > 1;

  let finance: DashboardFinance | null = null;
  let revenueTrend: DashboardSummary["charts"]["revenueTrend"] = null;
  let collectionThisMonth: DashboardSummary["charts"]["collectionThisMonth"] = null;
  let expensesByCategory: DashboardSummary["charts"]["expensesByCategory"] = null;
  let revenueByHostel: Map<string, number> | null = null;

  if (financial) {
    // Month-to-date vs the same span of last month (clamped to its length).
    const prevStart = addMonths(today, -1);
    const prevEndCandidate = addDays(prevStart, Number(today.slice(8, 10)) - 1);
    const prevEnd = prevEndCandidate > endOfMonth(prevStart) ? endOfMonth(prevStart) : prevEndCandidate;
    const categoryFrom = addMonths(today, -2);
    const [current, previous, trendRows, dailyRows, categoryRows, byHostel] = await Promise.all([
      financeTotals(ctx, ids, monthStart, today),
      financeTotals(ctx, ids, prevStart, prevEnd),
      prisma.$queryRaw<{ month: string; kind: "billed" | "collected"; amount: number }[]>(Prisma.sql`
        SELECT month, kind, COALESCE(SUM(amount), 0)::float8 AS amount FROM (
          SELECT to_char(i."issueDate", 'YYYY-MM') AS month, 'billed' AS kind, i."total" AS amount
          FROM "Invoice" i
          WHERE i."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'i."hostelId"')}
            AND i."status" NOT IN ('DRAFT', 'CANCELLED')
            AND i."issueDate" BETWEEN ${startOfMonth(trendFrom)}::date AND ${today}::date
          UNION ALL
          SELECT to_char(p."paymentDate", 'YYYY-MM'), 'collected', ${signed}
          FROM "Payment" p
          WHERE p."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'p."hostelId"')}
            AND p."status" = 'COMPLETED'
            AND p."paymentDate" BETWEEN ${startOfMonth(trendFrom)}::date AND ${today}::date
        ) t GROUP BY month, kind
      `),
      prisma.$queryRaw<{ day: string; net: number }[]>(Prisma.sql`
        SELECT to_char(p."paymentDate", 'YYYY-MM-DD') AS day, COALESCE(SUM(${signed}), 0)::float8 AS net
        FROM "Payment" p
        WHERE p."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'p."hostelId"')}
          AND p."status" = 'COMPLETED' AND p."paymentDate" BETWEEN ${monthStart}::date AND ${today}::date
        GROUP BY 1
      `),
      prisma.$queryRaw<{ category: string; amount: number }[]>(Prisma.sql`
        SELECT c."name" AS category, COALESCE(SUM(e."amount"), 0)::float8 AS amount
        FROM "Expense" e
        JOIN "ExpenseCategory" c ON c."id" = e."categoryId"
        WHERE e."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'e."hostelId"')}
          AND e."status" = 'RECORDED' AND e."date" BETWEEN ${startOfMonth(categoryFrom)}::date AND ${today}::date
        GROUP BY c."name"
        ORDER BY amount DESC
        LIMIT 8
      `),
      compare
        ? prisma.invoice.groupBy({
            by: ["hostelId"],
            where: { ...where, status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: { gte: dateOnly(monthStart), lte: dateOnly(today) } },
            _sum: { total: true },
          })
        : Promise.resolve([]),
    ]);
    finance = { ...current, previous };
    const trendMap = new Map<string, { billed: number; collected: number }>();
    for (const r of trendRows) {
      const m = trendMap.get(r.month) ?? { billed: 0, collected: 0 };
      m[r.kind] = round2(Number(r.amount));
      trendMap.set(r.month, m);
    }
    revenueTrend = monthKeys(trendFrom, today).map((month) => ({ month, ...(trendMap.get(month) ?? { billed: 0, collected: 0 }) }));
    const daily = new Map(dailyRows.map((d) => [d.day, round2(Number(d.net))]));
    collectionThisMonth = dayKeys(monthStart, today).map((day) => ({ day, collected: daily.get(day) ?? 0 }));
    expensesByCategory = categoryRows.map((c) => ({ category: c.category, amount: round2(Number(c.amount)) }));
    revenueByHostel = new Map(byHostel.map((h) => [h.hostelId, round2(toNumber(h._sum.total))]));
  }

  let outstanding: DashboardSummary["outstanding"] = null;
  if (canOutstanding) {
    const [open, overdue] = await Promise.all([
      prisma.invoice.aggregate({ where: { ...where, status: { in: RECEIVABLE_STATUSES } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
      prisma.invoice.aggregate({ where: { ...where, status: { in: RECEIVABLE_STATUSES }, dueDate: { lt: dateOnly(today) } }, _sum: { total: true, amountPaid: true } }),
    ]);
    outstanding = {
      total: round2(toNumber(open._sum.total) - toNumber(open._sum.amountPaid)),
      overdue: round2(toNumber(overdue._sum.total) - toNumber(overdue._sum.amountPaid)),
      invoices: open._count._all,
    };
  }

  const hostels = hostelRows.map((h) => ({ ...h, occupancy: occupancy.byHostel.get(h.id) ?? computeOccupancy({}) }));
  const activity = await getRecentActivity(ctx);

  return {
    today,
    scope: { hostelId: ctx.activeHostelId, hostelName: activeHostel?.name ?? null },
    isEmpty: hostelRows.length === 0,
    setup: { hostels: hostelRows.length, rooms, residents: residentsOnRecord },
    kpis: {
      hostels: hostelRows.length,
      rooms,
      occupancy: occupancy.overall,
      activeResidents,
      activeStaff,
      openMaintenance,
    },
    finance,
    outstanding,
    charts: {
      occupancyTrend: trend,
      revenueTrend,
      collectionThisMonth,
      expensesByCategory,
      hostelComparison: compare
        ? hostels.map((h) => ({
            hostelId: h.id,
            hostel: h.name,
            occupancy: h.occupancy.occupancyRate,
            revenue: revenueByHostel ? (revenueByHostel.get(h.id) ?? 0) : null,
          }))
        : null,
    },
    hostels,
    activity,
  };
}
