import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod, PaymentType } from "@/generated/prisma/enums";
import { listHostelIds, requirePermission, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import { dateRangeSchema } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { round2, toNumber } from "@/lib/serialize";
import { dateOnly } from "@/lib/format";
import { markOverdueInvoices, RECEIVABLE_STATUSES } from "./ledger";
import { rangeDays } from "./range";

/**
 * Finance aggregations. Everything is computed with aggregate/groupBy or
 * parameterized, tenant-scoped SQL — rows are never loaded into memory.
 *
 * Cash model (docs/CONVENTIONS.md):
 *   grossCollected = Σ PAYMENT + Σ ADVANCE (signed; credit applied nets to zero)
 *   collected      = grossCollected − Σ REFUND
 *   netIncome      = grossCollected − expenses − refunds  (= collected − expenses)
 * Revenue billed  = Σ invoice.total, non-draft / non-cancelled, by issueDate.
 */

export type FinanceRange = { from: Date | string; to: Date | string; hostelId?: string | null };

function normalizeRange(range: FinanceRange) {
  const parsed = parseInput(dateRangeSchema, { from: range.from, to: range.to });
  return { from: dateOnly(parsed.from), to: dateOnly(parsed.to), hostelId: range.hostelId || undefined };
}

/** SQL fragment restricting to the hostels this member may see (and the switcher). */
function hostelSql(ctx: TenantContext, hostelId?: string) {
  const ids = listHostelIds(ctx, hostelId);
  return ids ? Prisma.sql`AND "hostelId" = ANY(${ids}::text[])` : Prisma.empty;
}

export async function getFinanceSummary(ctx: TenantContext, rawRange: FinanceRange) {
  requirePermission(ctx, "reports.financial");
  const { from, to, hostelId } = normalizeRange(rawRange);
  await markOverdueInvoices(ctx.organizationId, ctx.organization.timezone);
  const scope = scopedWhere(ctx, hostelId);

  const [billed, payments, receivable, overdue, expenses] = await Promise.all([
    prisma.invoice.aggregate({
      where: { ...scope, status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: { gte: from, lte: to } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["type"],
      where: { ...scope, status: "COMPLETED", paymentDate: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { ...scope, status: { in: RECEIVABLE_STATUSES } },
      _sum: { total: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { ...scope, status: "OVERDUE" },
      _sum: { total: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: { ...scope, status: "RECORDED", date: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const byType = (t: PaymentType) => toNumber(payments.find((p) => p.type === t)?._sum.amount);
  const grossCollected = round2(byType("PAYMENT") + byType("ADVANCE"));
  const refunds = round2(byType("REFUND"));
  const collected = round2(grossCollected - refunds);
  const expenseTotal = round2(toNumber(expenses._sum.amount));
  const revenueBilled = round2(toNumber(billed._sum.total));

  return {
    from,
    to,
    revenueBilled,
    invoiceCount: billed._count._all,
    grossCollected,
    refunds,
    collected,
    paymentCount: payments.filter((p) => p.type !== "REFUND").reduce((s, p) => s + p._count._all, 0),
    outstanding: round2(toNumber(receivable._sum.total) - toNumber(receivable._sum.amountPaid)),
    outstandingCount: receivable._count._all,
    overdue: round2(toNumber(overdue._sum.total) - toNumber(overdue._sum.amountPaid)),
    overdueCount: overdue._count._all,
    expenses: expenseTotal,
    expenseCount: expenses._count._all,
    netIncome: round2(grossCollected - expenseTotal - refunds),
    /** Share of billed revenue collected in the same period (0–100), null when nothing was billed. */
    collectionRate: revenueBilled > 0 ? round2(Math.min(100, (grossCollected / revenueBilled) * 100)) : null,
  };
}

export type FinanceSummary = Awaited<ReturnType<typeof getFinanceSummary>>;

type BucketRow = { bucket: string; amount: number | string | null };

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** Last 12 calendar months ending with the month of `to`: billed vs collected vs expenses. */
async function monthlySeries(ctx: TenantContext, to: Date, hostelId?: string) {
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0));
  const start = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
  const org = ctx.organizationId;
  const hostels = hostelSql(ctx, hostelId);

  const [billed, collected, expenses] = await Promise.all([
    prisma.$queryRaw<BucketRow[]>`
      SELECT to_char(date_trunc('month', "issueDate"::timestamp), 'YYYY-MM') AS bucket, COALESCE(SUM("total"), 0)::float8 AS amount
      FROM "Invoice"
      WHERE "organizationId" = ${org} AND "status" NOT IN ('DRAFT', 'CANCELLED')
        AND "issueDate" >= ${ymd(start)}::date AND "issueDate" <= ${ymd(end)}::date ${hostels}
      GROUP BY 1`,
    prisma.$queryRaw<BucketRow[]>`
      SELECT to_char(date_trunc('month', "paymentDate"::timestamp), 'YYYY-MM') AS bucket,
             COALESCE(SUM(CASE WHEN "type" = 'REFUND' THEN -"amount" ELSE "amount" END), 0)::float8 AS amount
      FROM "Payment"
      WHERE "organizationId" = ${org} AND "status" = 'COMPLETED'
        AND "paymentDate" >= ${ymd(start)}::date AND "paymentDate" <= ${ymd(end)}::date ${hostels}
      GROUP BY 1`,
    prisma.$queryRaw<BucketRow[]>`
      SELECT to_char(date_trunc('month', "date"::timestamp), 'YYYY-MM') AS bucket, COALESCE(SUM("amount"), 0)::float8 AS amount
      FROM "Expense"
      WHERE "organizationId" = ${org} AND "status" = 'RECORDED'
        AND "date" >= ${ymd(start)}::date AND "date" <= ${ymd(end)}::date ${hostels}
      GROUP BY 1`,
  ]);
  const map = (rows: BucketRow[]) => new Map(rows.map((r) => [r.bucket, round2(Number(r.amount ?? 0))]));
  const [b, c, e] = [map(billed), map(collected), map(expenses)];
  const months: { month: string; label: string; billed: number; collected: number; expenses: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = monthKey(d);
    months.push({
      month: key,
      label: new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" }).format(d),
      billed: b.get(key) ?? 0,
      collected: c.get(key) ?? 0,
      expenses: e.get(key) ?? 0,
    });
  }
  return months;
}

type TrendUnit = "day" | "week" | "month";

/** Net cash collected over the selected range, bucketed by day/week/month. */
async function collectionTrend(ctx: TenantContext, from: Date, to: Date, hostelId?: string) {
  const days = rangeDays({ from, to });
  const unit: TrendUnit = days <= 62 ? "day" : days <= 370 ? "week" : "month";
  // `unit` comes from the whitelist above, never from input.
  const trunc = Prisma.raw(`'${unit}'`);
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT to_char(date_trunc(${trunc}, "paymentDate"::timestamp), 'YYYY-MM-DD') AS bucket,
           COALESCE(SUM(CASE WHEN "type" = 'REFUND' THEN -"amount" ELSE "amount" END), 0)::float8 AS amount
    FROM "Payment"
    WHERE "organizationId" = ${ctx.organizationId} AND "status" = 'COMPLETED'
      AND "paymentDate" >= ${ymd(from)}::date AND "paymentDate" <= ${ymd(to)}::date ${hostelSql(ctx, hostelId)}
    GROUP BY 1`;
  const values = new Map(rows.map((r) => [r.bucket, round2(Number(r.amount ?? 0))]));

  // Fill empty buckets so the area reads as a continuous series.
  const points: { date: string; label: string; amount: number }[] = [];
  let cursor: Date;
  if (unit === "day") cursor = new Date(from);
  else if (unit === "week") cursor = new Date(from.getTime() - ((from.getUTCDay() + 6) % 7) * 86400_000);
  else cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const labelFmt: Intl.DateTimeFormatOptions =
    unit === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" };
  while (cursor <= to && points.length < 400) {
    const key = cursor.toISOString().slice(0, 10);
    points.push({ date: key, label: new Intl.DateTimeFormat("en", labelFmt).format(cursor), amount: values.get(key) ?? 0 });
    cursor =
      unit === "day"
        ? new Date(cursor.getTime() + 86400_000)
        : unit === "week"
          ? new Date(cursor.getTime() + 7 * 86400_000)
          : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return { unit, points };
}

/** Full dataset for the finance overview page. */
export async function getFinanceDashboard(ctx: TenantContext, rawRange: FinanceRange) {
  requirePermission(ctx, "reports.financial");
  const { from, to, hostelId } = normalizeRange(rawRange);
  const scope = scopedWhere(ctx, hostelId);

  const [summary, monthly, trend, hostelBilled, hostelPayments, expenseGroups, methodGroups] = await Promise.all([
    getFinanceSummary(ctx, { from, to, hostelId }),
    monthlySeries(ctx, to, hostelId),
    collectionTrend(ctx, from, to, hostelId),
    prisma.invoice.groupBy({
      by: ["hostelId"],
      where: { ...scope, status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: { gte: from, lte: to } },
      _sum: { total: true },
    }),
    prisma.payment.groupBy({
      by: ["hostelId", "type"],
      where: { ...scope, status: "COMPLETED", paymentDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: { ...scope, status: "RECORDED", date: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: { ...scope, status: "COMPLETED", type: { in: ["PAYMENT", "ADVANCE"] }, paymentDate: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const hostelIds = [...new Set([...hostelBilled.map((h) => h.hostelId), ...hostelPayments.map((h) => h.hostelId)])];
  const categoryIds = expenseGroups.map((g) => g.categoryId);
  const [hostels, categories] = await Promise.all([
    hostelIds.length
      ? prisma.hostel.findMany({ where: { organizationId: ctx.organizationId, id: { in: hostelIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    categoryIds.length
      ? prisma.expenseCategory.findMany({ where: { organizationId: ctx.organizationId, id: { in: categoryIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const hostelName = new Map(hostels.map((h) => [h.id, h.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const byHostel = hostelIds
    .map((id) => {
      const billed = round2(toNumber(hostelBilled.find((h) => h.hostelId === id)?._sum.total));
      const collected = round2(
        hostelPayments
          .filter((p) => p.hostelId === id)
          .reduce((s, p) => s + (p.type === "REFUND" ? -1 : 1) * toNumber(p._sum.amount), 0),
      );
      return { hostelId: id, name: hostelName.get(id) ?? "Hostel", billed, collected };
    })
    .sort((a, b) => b.billed - a.billed || b.collected - a.collected);

  const expensesByCategory = expenseGroups
    .map((g) => ({ categoryId: g.categoryId, name: categoryName.get(g.categoryId) ?? "Other", total: round2(toNumber(g._sum.amount)), count: g._count._all }))
    .sort((a, b) => b.total - a.total);

  const methodTotal = methodGroups.reduce((s, g) => s + Math.max(0, toNumber(g._sum.amount)), 0);
  const paymentMethods = methodGroups
    .map((g) => {
      const total = round2(toNumber(g._sum.amount));
      return { method: g.method as PaymentMethod, total, count: g._count._all, share: methodTotal > 0 ? round2((Math.max(0, total) / methodTotal) * 100) : 0 };
    })
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);

  return { summary, monthly, trend, byHostel, expensesByCategory, paymentMethods };
}

export type FinanceDashboard = Awaited<ReturnType<typeof getFinanceDashboard>>;
