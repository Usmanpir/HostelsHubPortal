import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { paymentMethodLabels } from "@/config/labels";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { buckets, dateWhere, fillBuckets, hostelSql, isoDate, pct, reportHostelIds, reportScope, type ReportFilters } from "./shared";

export function expenseWhere(ctx: TenantContext, f: Pick<ReportFilters, "from" | "to" | "hostelId">): Prisma.ExpenseWhereInput {
  return { ...reportScope(ctx, f), status: "RECORDED", date: dateWhere(f) };
}

export const expensesReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const b = buckets(f);
    const w = expenseWhere(ctx, f);
    const [agg, byCategory, byHostel, series] = await Promise.all([
      prisma.expense.aggregate({ where: w, _sum: { amount: true }, _count: { _all: true } }),
      prisma.expense.groupBy({ by: ["categoryId"], where: w, _sum: { amount: true }, _count: { _all: true } }),
      prisma.expense.groupBy({ by: ["hostelId"], where: w, _sum: { amount: true } }),
      prisma.$queryRaw<{ period: string; amount: number }[]>(Prisma.sql`
        SELECT to_char(e."date", ${b.fmt}) AS period, COALESCE(SUM(e."amount"), 0)::float8 AS amount
        FROM "Expense" e
        WHERE e."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'e."hostelId"')}
          AND e."status" = 'RECORDED'
          AND e."date" BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY 1
      `),
    ]);
    const [categories, hostels] = await Promise.all([
      prisma.expenseCategory.findMany({
        where: { organizationId: ctx.organizationId, id: { in: byCategory.map((c) => c.categoryId) } },
        select: { id: true, name: true },
      }),
      prisma.hostel.findMany({
        where: { organizationId: ctx.organizationId, id: { in: byHostel.map((h) => h.hostelId) } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const total = round2(toNumber(agg._sum.amount));
    const cats = byCategory
      .map((c) => ({ id: c.categoryId, name: catName.get(c.categoryId) ?? "Uncategorised", amount: round2(toNumber(c._sum.amount)), count: c._count._all }))
      .sort((a, z) => z.amount - a.amount);
    const hostelAmount = new Map(byHostel.map((h) => [h.hostelId, round2(toNumber(h._sum.amount))]));
    const months = Math.max(1, new Set(b.keys.map((k) => k.slice(0, 7))).size);
    return {
      stats: [
        { label: "Total expenses", value: total, format: "money", tone: "warning" },
        { label: "Entries", value: agg._count._all, format: "number" },
        { label: "Average per month", value: round2(total / months), format: "money" },
        { label: "Largest category", value: cats[0]?.amount ?? null, format: "money", hint: cats[0]?.name ?? "No expenses recorded" },
      ],
      charts: [
        {
          id: "trend",
          title: `Expenses per ${b.label}`,
          kind: "column",
          xKey: "period",
          xFormat: b.xFormat,
          format: "money",
          span: "half",
          series: [{ key: "amount", label: "Expenses" }],
          data: fillBuckets(b.keys, new Map(series.map((s) => [s.period, { amount: round2(Number(s.amount)) }])), { amount: 0 }),
        },
        {
          id: "categories",
          title: "By category",
          kind: "bar",
          xKey: "category",
          format: "money",
          span: "half",
          series: [{ key: "amount", label: "Expenses" }],
          data: cats.map((c) => ({ category: c.name, amount: c.amount })),
        },
      ],
      breakdowns: [
        {
          id: "categories",
          title: "By category",
          columns: [
            { key: "name", header: "Category" },
            { key: "count", header: "Entries", format: "number", align: "end" },
            { key: "amount", header: "Amount", format: "money", align: "end" },
            { key: "share", header: "Share", format: "percent", align: "end" },
          ],
          rows: cats.map((c) => ({ id: c.id, name: c.name, count: c.count, amount: c.amount, share: pct(c.amount, total) })),
          totals: { id: "total", name: "Total", count: agg._count._all, amount: total, share: total ? 100 : 0 },
        },
        ...(hostels.length > 1
          ? [
              {
                id: "hostels",
                title: "By hostel",
                columns: [
                  { key: "name", header: "Hostel" },
                  { key: "amount", header: "Amount", format: "money" as const, align: "end" as const },
                  { key: "share", header: "Share", format: "percent" as const, align: "end" as const },
                ],
                rows: hostels.map((h) => ({ id: h.id, name: h.name, amount: hostelAmount.get(h.id) ?? 0, share: pct(hostelAmount.get(h.id) ?? 0, total) })),
                totals: { id: "total", name: "Total", amount: total, share: total ? 100 : 0 },
              },
            ]
          : []),
      ],
    };
  },

  async rows(ctx, f, paging) {
    const w = expenseWhere(ctx, f);
    const [rows, total] = await Promise.all([
      prisma.expense.findMany({
        where: w,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          date: true,
          amount: true,
          vendor: true,
          description: true,
          paymentMethod: true,
          reference: true,
          category: { select: { name: true } },
          hostel: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      }),
      prisma.expense.count({ where: w }),
    ]);
    return {
      title: "Expenses in the period",
      total,
      columns: [
        { key: "date", header: "Date", format: "date" },
        { key: "category", header: "Category", subKey: "description" },
        { key: "hostel", header: "Hostel", hideOnMobile: true },
        { key: "vendor", header: "Vendor", hideOnMobile: true },
        { key: "method", header: "Method", format: "badge", labels: paymentMethodLabels, hideOnMobile: true },
        { key: "reference", header: "Reference", defaultHidden: true },
        { key: "createdBy", header: "Recorded by", defaultHidden: true },
        { key: "amount", header: "Amount", format: "money", align: "end" },
      ],
      rows: rows.map((e) => ({
        id: e.id,
        date: isoDate(e.date),
        category: e.category.name,
        description: e.description,
        hostel: e.hostel.name,
        vendor: e.vendor,
        method: e.paymentMethod,
        reference: e.reference,
        createdBy: e.createdBy?.name ?? null,
        amount: round2(toNumber(e.amount)),
      })),
    };
  },
};
