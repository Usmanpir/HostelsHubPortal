import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ChargeType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { chargeTypeLabels, invoiceStatusLabels, invoiceStatusTones } from "@/config/labels";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { buckets, dateWhere, fillBuckets, hostelSql, isoDate, nameOf, pct, reportHostelIds, reportScope, type ReportFilters } from "./shared";

/** Revenue billed = non-draft, non-cancelled invoices by issue date. */
export function billedWhere(ctx: TenantContext, f: Pick<ReportFilters, "from" | "to" | "hostelId">): Prisma.InvoiceWhereInput {
  return { ...reportScope(ctx, f), status: { notIn: ["DRAFT", "CANCELLED"] }, issueDate: dateWhere(f) };
}

export const revenueReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const b = buckets(f);
    const w = billedWhere(ctx, f);
    const [agg, byHostel, series, byCharge] = await Promise.all([
      prisma.invoice.aggregate({ where: w, _sum: { total: true, amountPaid: true, discount: true, tax: true }, _count: { _all: true } }),
      prisma.invoice.groupBy({ by: ["hostelId"], where: w, _sum: { total: true, amountPaid: true } }),
      prisma.$queryRaw<{ period: string; billed: number; paid: number }[]>(Prisma.sql`
        SELECT to_char(i."issueDate", ${b.fmt}) AS period,
               COALESCE(SUM(i."total"), 0)::float8 AS billed,
               COALESCE(SUM(i."amountPaid"), 0)::float8 AS paid
        FROM "Invoice" i
        WHERE i."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'i."hostelId"')}
          AND i."status" NOT IN ('DRAFT', 'CANCELLED')
          AND i."issueDate" BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY 1
      `),
      prisma.$queryRaw<{ type: ChargeType; amount: number; lines: number }[]>(Prisma.sql`
        SELECT it."type", COALESCE(SUM(it."amount"), 0)::float8 AS amount, count(*)::int AS lines
        FROM "InvoiceItem" it
        JOIN "Invoice" i ON i."id" = it."invoiceId"
        WHERE i."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'i."hostelId"')}
          AND i."status" NOT IN ('DRAFT', 'CANCELLED')
          AND i."issueDate" BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY it."type"
        ORDER BY amount DESC
      `),
    ]);
    const billed = round2(toNumber(agg._sum.total));
    const paid = round2(toNumber(agg._sum.amountPaid));
    const hostels = await prisma.hostel.findMany({
      where: { organizationId: ctx.organizationId, id: { in: byHostel.map((h) => h.hostelId) } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const hostelSum = new Map(byHostel.map((h) => [h.hostelId, h]));
    const chargeTotal = round2(byCharge.reduce((s, c) => s + Number(c.amount), 0));
    return {
      stats: [
        { label: "Revenue billed", value: billed, format: "money", tone: "info" },
        { label: "Paid against these invoices", value: paid, format: "money", tone: "success" },
        { label: "Still outstanding", value: round2(billed - paid), format: "money", tone: billed - paid > 0 ? "warning" : "default" },
        { label: "Collection rate", value: pct(paid, billed), format: "percent" },
        { label: "Invoices", value: agg._count._all, format: "number" },
        { label: "Discounts given", value: round2(toNumber(agg._sum.discount)), format: "money" },
      ],
      charts: [
        {
          id: "trend",
          title: `Billed vs paid per ${b.label}`,
          kind: "column",
          xKey: "period",
          xFormat: b.xFormat,
          format: "money",
          span: "half",
          series: [
            { key: "billed", label: "Billed" },
            { key: "paid", label: "Paid" },
          ],
          data: fillBuckets(b.keys, new Map(series.map((s) => [s.period, { billed: round2(Number(s.billed)), paid: round2(Number(s.paid)) }])), {
            billed: 0,
            paid: 0,
          }),
        },
        {
          id: "charges",
          title: "By charge type",
          description: "Line items before discount and tax",
          kind: "bar",
          xKey: "type",
          format: "money",
          span: "half",
          series: [{ key: "amount", label: "Billed" }],
          data: byCharge.map((c) => ({ type: chargeTypeLabels[c.type], amount: round2(Number(c.amount)) })),
        },
      ],
      breakdowns: [
        {
          id: "charges",
          title: "By charge type",
          description: "Line items before discount and tax",
          columns: [
            { key: "name", header: "Charge type" },
            { key: "lines", header: "Line items", format: "number", align: "end" },
            { key: "amount", header: "Amount", format: "money", align: "end" },
            { key: "share", header: "Share", format: "percent", align: "end" },
          ],
          rows: byCharge.map((c) => ({ id: c.type, name: chargeTypeLabels[c.type], lines: Number(c.lines), amount: round2(Number(c.amount)), share: pct(Number(c.amount), chargeTotal) })),
          totals: { id: "total", name: "Total", lines: byCharge.reduce((s, c) => s + Number(c.lines), 0), amount: chargeTotal, share: chargeTotal ? 100 : 0 },
        },
        ...(hostels.length > 1
          ? [
              {
                id: "hostels",
                title: "By hostel",
                columns: [
                  { key: "name", header: "Hostel" },
                  { key: "billed", header: "Billed", format: "money" as const, align: "end" as const },
                  { key: "paid", header: "Paid", format: "money" as const, align: "end" as const },
                  { key: "share", header: "Share of revenue", format: "percent" as const, align: "end" as const },
                ],
                rows: hostels.map((h) => {
                  const s = hostelSum.get(h.id);
                  const hb = round2(toNumber(s?._sum.total));
                  return { id: h.id, name: h.name, billed: hb, paid: round2(toNumber(s?._sum.amountPaid)), share: pct(hb, billed) };
                }),
                totals: { id: "total", name: "Total", billed, paid, share: billed ? 100 : 0 },
              },
            ]
          : []),
      ],
    };
  },

  async rows(ctx, f, paging) {
    const w = billedWhere(ctx, f);
    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where: w,
        orderBy: [{ issueDate: "desc" }, { invoiceNumber: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          status: true,
          resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
          hostel: { select: { name: true } },
        },
      }),
      prisma.invoice.count({ where: w }),
    ]);
    return {
      title: "Invoices issued in the period",
      total,
      columns: [
        { key: "number", header: "Invoice", hrefKey: "href" },
        { key: "issueDate", header: "Issued", format: "date" },
        { key: "dueDate", header: "Due", format: "date", hideOnMobile: true },
        { key: "resident", header: "Resident", hrefKey: "residentHref", subKey: "code" },
        { key: "hostel", header: "Hostel", hideOnMobile: true },
        { key: "status", header: "Status", format: "badge", labels: invoiceStatusLabels, tones: invoiceStatusTones },
        { key: "total", header: "Total", format: "money", align: "end" },
        { key: "paid", header: "Paid", format: "money", align: "end", hideOnMobile: true },
        { key: "balance", header: "Balance", format: "money", align: "end" },
      ],
      rows: rows.map((i) => ({
        id: i.id,
        number: i.invoiceNumber,
        href: `/finance/invoices/${i.id}`,
        issueDate: isoDate(i.issueDate),
        dueDate: isoDate(i.dueDate),
        resident: nameOf(i.resident),
        code: i.resident.residentCode,
        residentHref: `/residents/${i.resident.id}`,
        hostel: i.hostel.name,
        status: i.status,
        total: round2(toNumber(i.total)),
        paid: round2(toNumber(i.amountPaid)),
        balance: round2(toNumber(i.total) - toNumber(i.amountPaid)),
      })),
    };
  },
};
