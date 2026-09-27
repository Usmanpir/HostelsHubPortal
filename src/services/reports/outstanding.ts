import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { round2 } from "@/lib/serialize";
import { residentStatusLabels, residentStatusTones } from "@/config/labels";
import type { TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { hostelSql, isoDate, nameOf, reportHostelIds, type ReportFilters } from "./shared";

const BUCKETS = [
  { key: "current", label: "Not yet due" },
  { key: "d30", label: "1–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "61–90 days" },
  { key: "d90plus", label: "90+ days" },
] as const;

type BucketKey = (typeof BUCKETS)[number]["key"];
type Buckets = Record<BucketKey, number>;

/** Open receivables with days past due, as a reusable CTE. */
function openInvoices(ctx: TenantContext, f: ReportFilters) {
  const ids = reportHostelIds(ctx, f);
  return Prisma.sql`
    WITH inv AS (
      SELECT i."residentId", i."dueDate", (i."total" - i."amountPaid") AS balance, (${f.today}::date - i."dueDate") AS days
      FROM "Invoice" i
      WHERE i."organizationId" = ${ctx.organizationId} ${hostelSql(ids, 'i."hostelId"')}
        AND i."status" IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
        AND i."total" - i."amountPaid" > 0
    )`;
}

const bucketColumns = Prisma.sql`
  COALESCE(SUM(balance) FILTER (WHERE days <= 0), 0)::float8 AS current,
  COALESCE(SUM(balance) FILTER (WHERE days BETWEEN 1 AND 30), 0)::float8 AS d30,
  COALESCE(SUM(balance) FILTER (WHERE days BETWEEN 31 AND 60), 0)::float8 AS d60,
  COALESCE(SUM(balance) FILTER (WHERE days BETWEEN 61 AND 90), 0)::float8 AS d90,
  COALESCE(SUM(balance) FILTER (WHERE days > 90), 0)::float8 AS d90plus,
  COALESCE(SUM(balance), 0)::float8 AS total,
  count(*)::int AS invoices`;

function toBuckets(r: Buckets): Buckets {
  return {
    current: round2(Number(r.current)),
    d30: round2(Number(r.d30)),
    d60: round2(Number(r.d60)),
    d90: round2(Number(r.d90)),
    d90plus: round2(Number(r.d90plus)),
  };
}

export const outstandingReport: ReportImpl = {
  async summary(ctx, f) {
    const [row] = await prisma.$queryRaw<(Buckets & { total: number; invoices: number; residents: number })[]>(Prisma.sql`
      ${openInvoices(ctx, f)}
      SELECT ${bucketColumns}, count(DISTINCT "residentId")::int AS residents FROM inv
    `);
    const b = toBuckets(row ?? { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 });
    const total = round2(Number(row?.total ?? 0));
    const overdue = round2(total - b.current);
    return {
      note: `Balances as of ${f.today}. Aging is measured from each invoice's due date; unapplied advance credit is not netted.`,
      stats: [
        { label: "Total outstanding", value: total, format: "money", tone: total ? "warning" : "default" },
        { label: "Overdue", value: overdue, format: "money", tone: overdue ? "danger" : "default" },
        { label: "90+ days overdue", value: b.d90plus, format: "money", tone: b.d90plus ? "danger" : "default" },
        { label: "Residents with dues", value: Number(row?.residents ?? 0), format: "number" },
        { label: "Open invoices", value: Number(row?.invoices ?? 0), format: "number" },
      ],
      charts: [
        {
          id: "aging",
          title: "Aging",
          description: "Outstanding balance by days past due",
          kind: "column",
          xKey: "bucket",
          format: "money",
          series: [{ key: "amount", label: "Outstanding" }],
          data: BUCKETS.map((k) => ({ bucket: k.label, amount: b[k.key] })),
        },
      ],
      breakdowns: [],
    };
  },

  async rows(ctx, f, paging) {
    const [grouped, countRow] = await Promise.all([
      prisma.$queryRaw<(Buckets & { residentId: string; total: number; invoices: number; oldestDue: Date })[]>(Prisma.sql`
        ${openInvoices(ctx, f)}
        SELECT "residentId", ${bucketColumns}, MIN("dueDate") AS "oldestDue"
        FROM inv
        GROUP BY "residentId"
        ORDER BY total DESC, "residentId"
        LIMIT ${paging.take}::int OFFSET ${paging.skip}::int
      `),
      prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        ${openInvoices(ctx, f)}
        SELECT count(DISTINCT "residentId")::int AS count FROM inv
      `),
    ]);
    const residents = grouped.length
      ? await prisma.resident.findMany({
          where: { organizationId: ctx.organizationId, id: { in: grouped.map((g) => g.residentId) } },
          select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true, status: true, hostel: { select: { name: true } } },
        })
      : [];
    const byId = new Map(residents.map((r) => [r.id, r]));
    return {
      title: "Outstanding by resident",
      total: Number(countRow[0]?.count ?? 0),
      columns: [
        { key: "resident", header: "Resident", hrefKey: "href", subKey: "code" },
        { key: "hostel", header: "Hostel", hideOnMobile: true },
        { key: "phone", header: "Phone", defaultHidden: true },
        { key: "status", header: "Status", format: "badge", labels: residentStatusLabels, tones: residentStatusTones, hideOnMobile: true },
        { key: "invoices", header: "Invoices", format: "number", align: "end", hideOnMobile: true },
        { key: "oldestDue", header: "Oldest due", format: "date", hideOnMobile: true },
        ...BUCKETS.map((k) => ({ key: k.key, header: k.label, format: "money" as const, align: "end" as const, hideOnMobile: true })),
        { key: "total", header: "Total due", format: "money", align: "end" },
      ],
      rows: grouped.map((g) => {
        const r = byId.get(g.residentId);
        return {
          id: g.residentId,
          resident: r ? nameOf(r) : "Unknown resident",
          code: r?.residentCode ?? null,
          href: `/residents/${g.residentId}`,
          hostel: r?.hostel.name ?? null,
          phone: r?.phone ?? null,
          status: r?.status ?? null,
          invoices: Number(g.invoices),
          oldestDue: isoDate(g.oldestDue),
          ...toBuckets(g),
          total: round2(Number(g.total)),
        };
      }),
    };
  },
};
