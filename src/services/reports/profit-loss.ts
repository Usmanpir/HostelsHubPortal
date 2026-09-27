import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { round2 } from "@/lib/serialize";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { fillMonths, hostelSql, pct, reportHostelIds, staffSql, type ReportFilters } from "./shared";

type Month = { billed: number; collected: number; refunds: number; expenses: number; payroll: number };
const EMPTY: Month = { billed: 0, collected: 0, refunds: 0, expenses: 0, payroll: 0 };

/** All P&L components per month in one UNION query. */
async function monthlyPnl(ctx: TenantContext, f: ReportFilters) {
  const ids = reportHostelIds(ctx, f);
  const org = ctx.organizationId;
  const rows = await prisma.$queryRaw<{ month: string; kind: keyof Month; amount: number }[]>(Prisma.sql`
    SELECT month, kind, COALESCE(SUM(amount), 0)::float8 AS amount FROM (
      SELECT to_char(i."issueDate", 'YYYY-MM') AS month, 'billed' AS kind, i."total" AS amount
      FROM "Invoice" i
      WHERE i."organizationId" = ${org} ${hostelSql(ids, 'i."hostelId"')}
        AND i."status" NOT IN ('DRAFT', 'CANCELLED')
        AND i."issueDate" BETWEEN ${f.from}::date AND ${f.to}::date
      UNION ALL
      SELECT to_char(p."paymentDate", 'YYYY-MM'), CASE WHEN p."type" = 'REFUND' THEN 'refunds' ELSE 'collected' END, p."amount"
      FROM "Payment" p
      WHERE p."organizationId" = ${org} ${hostelSql(ids, 'p."hostelId"')}
        AND p."status" = 'COMPLETED'
        AND p."paymentDate" BETWEEN ${f.from}::date AND ${f.to}::date
      UNION ALL
      SELECT to_char(e."date", 'YYYY-MM'), 'expenses', e."amount"
      FROM "Expense" e
      WHERE e."organizationId" = ${org} ${hostelSql(ids, 'e."hostelId"')}
        AND e."status" = 'RECORDED'
        AND e."date" BETWEEN ${f.from}::date AND ${f.to}::date
      UNION ALL
      SELECT to_char(COALESCE(pr."paymentDate", make_date(pr."year", pr."month", 1)), 'YYYY-MM'), 'payroll', pr."netSalary"
      FROM "Payroll" pr
      WHERE pr."organizationId" = ${org} ${staffSql(ids, 'pr."staffId"')}
        AND pr."status" = 'PAID'
        AND COALESCE(pr."paymentDate", make_date(pr."year", pr."month", 1)) BETWEEN ${f.from}::date AND ${f.to}::date
    ) t
    GROUP BY month, kind
  `);
  const map = new Map<string, Month>();
  for (const r of rows) {
    const m = map.get(r.month) ?? { ...EMPTY };
    m[r.kind] = round2(Number(r.amount));
    map.set(r.month, m);
  }
  return fillMonths(f, map, EMPTY).map((m) => ({
    ...m,
    cashIn: round2(m.collected - m.refunds),
    cashOut: round2(m.expenses + m.payroll),
    net: round2(m.collected - m.refunds - m.expenses - m.payroll),
  }));
}

export const profitLossReport: ReportImpl = {
  async summary(ctx, f) {
    const months = await monthlyPnl(ctx, f);
    const sum = (k: "billed" | "collected" | "refunds" | "expenses" | "payroll" | "net" | "cashIn" | "cashOut") =>
      round2(months.reduce((s, m) => s + m[k], 0));
    const net = sum("net");
    const cashIn = sum("cashIn");
    return {
      note: "Cash basis: net = collected − refunds − expenses − payroll paid. Billed revenue is shown for reference.",
      stats: [
        { label: "Revenue billed", value: sum("billed"), format: "money", tone: "info" },
        { label: "Cash collected", value: sum("collected"), format: "money", tone: "success" },
        { label: "Refunds", value: sum("refunds"), format: "money" },
        { label: "Expenses", value: sum("expenses"), format: "money", tone: "warning" },
        { label: "Payroll paid", value: sum("payroll"), format: "money" },
        { label: "Net result", value: net, format: "money", tone: net < 0 ? "danger" : "success", hint: `Margin ${pct(net, cashIn)}% of net cash in` },
      ],
      charts: [
        {
          id: "cash",
          title: "Cash in vs cash out",
          description: "Collected − refunds vs expenses + payroll",
          kind: "column",
          xKey: "month",
          xFormat: "month",
          format: "money",
          span: "half",
          series: [
            { key: "cashIn", label: "Cash in" },
            { key: "cashOut", label: "Cash out" },
          ],
          data: months.map((m) => ({ month: m.month, cashIn: m.cashIn, cashOut: m.cashOut })),
        },
        {
          id: "net",
          title: "Net result per month",
          kind: "column",
          xKey: "month",
          xFormat: "month",
          format: "money",
          span: "half",
          series: [{ key: "net", label: "Net result" }],
          data: months.map((m) => ({ month: m.month, net: m.net })),
        },
      ],
      breakdowns: [
        {
          id: "statement",
          title: "Statement",
          columns: [
            { key: "name", header: "Line" },
            { key: "amount", header: "Amount", format: "money", align: "end" },
          ],
          rows: [
            { id: "collected", name: "Cash collected (payments + advances)", amount: sum("collected") },
            { id: "refunds", name: "Less: refunds", amount: -sum("refunds") },
            { id: "expenses", name: "Less: operating expenses", amount: -sum("expenses") },
            { id: "payroll", name: "Less: payroll paid", amount: -sum("payroll") },
          ],
          totals: { id: "net", name: "Net result", amount: net },
        },
      ],
    };
  },

  async rows(ctx, f, paging) {
    const months = (await monthlyPnl(ctx, f)).reverse();
    return {
      title: "Monthly profit & loss",
      total: months.length,
      columns: [
        { key: "month", header: "Month", format: "text" },
        { key: "billed", header: "Billed", format: "money", align: "end" },
        { key: "collected", header: "Collected", format: "money", align: "end" },
        { key: "refunds", header: "Refunds", format: "money", align: "end", hideOnMobile: true },
        { key: "expenses", header: "Expenses", format: "money", align: "end" },
        { key: "payroll", header: "Payroll", format: "money", align: "end", hideOnMobile: true },
        { key: "net", header: "Net", format: "money", align: "end" },
      ],
      rows: months.slice(paging.skip, paging.skip + paging.take).map((m) => ({
        id: m.month,
        month: new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m.month}-01T00:00:00Z`)),
        billed: m.billed,
        collected: m.collected,
        refunds: m.refunds,
        expenses: m.expenses,
        payroll: m.payroll,
        net: m.net,
      })),
    };
  },
};
