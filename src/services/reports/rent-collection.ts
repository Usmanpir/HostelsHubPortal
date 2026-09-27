import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod, PaymentType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { round2, toNumber } from "@/lib/serialize";
import { paymentMethodLabels, paymentTypeLabels, type Tone } from "@/config/labels";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { buckets, dateWhere, fillBuckets, hostelSql, isoDate, nameOf, pct, reportHostelIds, reportScope, type ReportFilters } from "./shared";

const paymentTypeTones: Record<PaymentType, Tone> = { PAYMENT: "success", ADVANCE: "info", REFUND: "warning" };

/** Signed contribution of a payment row to cash collected. */
export function signedAmount(type: PaymentType, amount: number) {
  return type === "REFUND" ? -amount : amount;
}

function where(ctx: TenantContext, f: ReportFilters): Prisma.PaymentWhereInput {
  return { ...reportScope(ctx, f), status: "COMPLETED", paymentDate: dateWhere(f) };
}

export const rentCollectionReport: ReportImpl = {
  async summary(ctx, f) {
    const ids = reportHostelIds(ctx, f);
    const b = buckets(f);
    const w = where(ctx, f);
    const [byType, byMethod, byHostel, series] = await Promise.all([
      prisma.payment.groupBy({ by: ["type"], where: w, _sum: { amount: true }, _count: { _all: true } }),
      prisma.payment.groupBy({ by: ["method", "type"], where: w, _sum: { amount: true }, _count: { _all: true } }),
      prisma.payment.groupBy({ by: ["hostelId", "type"], where: w, _sum: { amount: true } }),
      prisma.$queryRaw<{ period: string; net: number }[]>(Prisma.sql`
        SELECT to_char(p."paymentDate", ${b.fmt}) AS period,
               COALESCE(SUM(CASE WHEN p."type" = 'REFUND' THEN -p."amount" ELSE p."amount" END), 0)::float8 AS net
        FROM "Payment" p
        WHERE p."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'p."hostelId"')}
          AND p."status" = 'COMPLETED'
          AND p."paymentDate" BETWEEN ${f.from}::date AND ${f.to}::date
        GROUP BY 1
      `),
    ]);
    const sumType = (t: PaymentType) => round2(toNumber(byType.find((r) => r.type === t)?._sum.amount));
    const payments = sumType("PAYMENT");
    const advances = sumType("ADVANCE");
    const refunds = sumType("REFUND");
    const net = round2(payments + advances - refunds);
    const receipts = byType.filter((r) => r.type !== "REFUND").reduce((s, r) => s + r._count._all, 0);

    const methods = new Map<PaymentMethod, { net: number; count: number }>();
    for (const r of byMethod) {
      const m = methods.get(r.method) ?? { net: 0, count: 0 };
      m.net = round2(m.net + signedAmount(r.type, toNumber(r._sum.amount)));
      if (r.type !== "REFUND") m.count += r._count._all;
      methods.set(r.method, m);
    }
    const hostelTotals = new Map<string, number>();
    for (const r of byHostel) hostelTotals.set(r.hostelId, round2((hostelTotals.get(r.hostelId) ?? 0) + signedAmount(r.type, toNumber(r._sum.amount))));
    const hostels = await prisma.hostel.findMany({
      where: { organizationId: ctx.organizationId, id: { in: [...hostelTotals.keys()] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return {
      stats: [
        { label: "Net cash collected", value: net, format: "money", tone: "success", hint: "Payments + advances − refunds" },
        { label: "Invoice payments", value: payments, format: "money" },
        { label: "Advances (net)", value: advances, format: "money", hint: "Credit received minus credit applied" },
        { label: "Refunds paid", value: refunds, format: "money", tone: refunds ? "warning" : "default" },
        { label: "Receipts", value: receipts, format: "number" },
      ],
      charts: [
        {
          id: "trend",
          title: `Collected per ${b.label}`,
          kind: "column",
          xKey: "period",
          xFormat: b.xFormat,
          format: "money",
          span: "half",
          series: [{ key: "net", label: "Net collected" }],
          data: fillBuckets(b.keys, new Map(series.map((s) => [s.period, { net: round2(Number(s.net)) }])), { net: 0 }),
        },
        {
          id: "methods",
          title: "By payment method",
          kind: "bar",
          xKey: "method",
          format: "money",
          span: "half",
          series: [{ key: "net", label: "Net collected" }],
          data: [...methods].map(([m, v]) => ({ method: paymentMethodLabels[m], net: v.net })).sort((a, b2) => b2.net - a.net),
        },
      ],
      breakdowns: [
        {
          id: "methods",
          title: "By payment method",
          columns: [
            { key: "name", header: "Method" },
            { key: "count", header: "Receipts", format: "number", align: "end" },
            { key: "net", header: "Net collected", format: "money", align: "end" },
            { key: "share", header: "Share", format: "percent", align: "end" },
          ],
          rows: [...methods].map(([m, v]) => ({ id: m, name: paymentMethodLabels[m], count: v.count, net: v.net, share: pct(v.net, net) })),
          totals: { id: "total", name: "Total", count: receipts, net, share: net ? 100 : 0 },
        },
        ...(hostels.length > 1
          ? [
              {
                id: "hostels",
                title: "By hostel",
                columns: [
                  { key: "name", header: "Hostel" },
                  { key: "net", header: "Net collected", format: "money" as const, align: "end" as const },
                  { key: "share", header: "Share", format: "percent" as const, align: "end" as const },
                ],
                rows: hostels.map((h) => ({ id: h.id, name: h.name, net: hostelTotals.get(h.id) ?? 0, share: pct(hostelTotals.get(h.id) ?? 0, net) })),
                totals: { id: "total", name: "Total", net, share: net ? 100 : 0 },
              },
            ]
          : []),
      ],
    };
  },

  async rows(ctx, f, paging) {
    const w = where(ctx, f);
    const [rows, total] = await Promise.all([
      prisma.payment.findMany({
        where: w,
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          receiptNumber: true,
          paymentDate: true,
          type: true,
          method: true,
          amount: true,
          reference: true,
          resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
          hostel: { select: { name: true } },
          invoice: { select: { invoiceNumber: true } },
          receivedBy: { select: { name: true } },
        },
      }),
      prisma.payment.count({ where: w }),
    ]);
    return {
      title: "Payments in the period",
      total,
      columns: [
        { key: "date", header: "Date", format: "date" },
        { key: "receipt", header: "Receipt", hrefKey: "href" },
        { key: "resident", header: "Resident", hrefKey: "residentHref", subKey: "code" },
        { key: "hostel", header: "Hostel", hideOnMobile: true },
        { key: "type", header: "Type", format: "badge", labels: paymentTypeLabels, tones: paymentTypeTones },
        { key: "method", header: "Method", format: "badge", labels: paymentMethodLabels, hideOnMobile: true },
        { key: "invoice", header: "Invoice", hideOnMobile: true },
        { key: "reference", header: "Reference", defaultHidden: true },
        { key: "receivedBy", header: "Received by", defaultHidden: true },
        { key: "amount", header: "Amount", format: "money", align: "end" },
      ],
      rows: rows.map((p) => ({
        id: p.id,
        date: isoDate(p.paymentDate),
        receipt: p.receiptNumber,
        href: `/finance/payments/${p.id}`,
        resident: nameOf(p.resident),
        code: p.resident.residentCode,
        residentHref: `/residents/${p.resident.id}`,
        hostel: p.hostel.name,
        type: p.type,
        method: p.method,
        invoice: p.invoice?.invoiceNumber ?? null,
        reference: p.reference,
        receivedBy: p.receivedBy?.name ?? null,
        amount: round2(signedAmount(p.type, toNumber(p.amount))),
      })),
    };
  },
};
