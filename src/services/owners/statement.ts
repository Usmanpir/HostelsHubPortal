import { prisma, type DbClient } from "@/lib/db/prisma";
import type { OwnerPayoutStatus } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/errors";
import { dateOnly, todayInTimeZone } from "@/lib/format";
import { round2, serialize, toNumber } from "@/lib/serialize";
import type { TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { statementPeriodSchema } from "@/lib/validation/owners";
import { lastMonth, toDay, type Period } from "./period";
import { accessiblePropertyWhere, ownerWhere, requireOwners } from "./scope";

/**
 * Owner statement: for each property linked to the owner, over a period —
 *   collected = Σ PAYMENT + Σ ADVANCE (signed) − Σ REFUND   (status COMPLETED, by paymentDate)
 *   expenses  = Σ expense.amount                            (status RECORDED, by date)
 *   fee       = max(collected, 0) × (property.managementFeePercent ?? owner.commissionPercent) / 100
 *   net       = collected − expenses − fee
 * Totals are the sum of the (rounded) property lines. Aggregation uses
 * groupBy — a fixed number of queries regardless of property count.
 */

export type CashSums = { payments: number; advances: number; refunds: number };

export type StatementPropertyInput = {
  id: string;
  name: string;
  code: string;
  archivedAt: Date | null;
  managementFeePercent: number | null;
};

export type StatementLine = {
  hostelId: string;
  name: string;
  code: string;
  archived: boolean;
  feePercent: number;
  feeSource: "PROPERTY" | "OWNER";
  payments: number;
  advances: number;
  refunds: number;
  collected: number;
  expenses: number;
  fee: number;
  net: number;
};

export type StatementTotals = Omit<StatementLine, "hostelId" | "name" | "code" | "archived" | "feePercent" | "feeSource">;

const EMPTY_CASH: CashSums = { payments: 0, advances: 0, refunds: 0 };

/** Pure statement math (unit-tested). */
export function computeStatementLines(
  properties: StatementPropertyInput[],
  ownerCommissionPercent: number,
  cash: Map<string, CashSums>,
  expenses: Map<string, number>,
): { lines: StatementLine[]; totals: StatementTotals } {
  const lines = properties.map((p): StatementLine => {
    const c = cash.get(p.id) ?? EMPTY_CASH;
    const collected = round2(c.payments + c.advances - c.refunds);
    const spent = round2(expenses.get(p.id) ?? 0);
    const override = p.managementFeePercent !== null && p.managementFeePercent !== undefined;
    const feePercent = override ? p.managementFeePercent! : ownerCommissionPercent;
    // No fee is earned on a period where refunds exceeded collections.
    const fee = round2((Math.max(collected, 0) * feePercent) / 100);
    return {
      hostelId: p.id,
      name: p.name,
      code: p.code,
      archived: p.archivedAt !== null,
      feePercent,
      feeSource: override ? "PROPERTY" : "OWNER",
      payments: round2(c.payments),
      advances: round2(c.advances),
      refunds: round2(c.refunds),
      collected,
      expenses: spent,
      fee,
      net: round2(collected - spent - fee),
    };
  });
  const sum = (key: keyof StatementTotals) => round2(lines.reduce((s, l) => s + l[key], 0));
  return {
    lines,
    totals: {
      payments: sum("payments"),
      advances: sum("advances"),
      refunds: sum("refunds"),
      collected: sum("collected"),
      expenses: sum("expenses"),
      fee: sum("fee"),
      net: sum("net"),
    },
  };
}

const periodWhere = (period: Period) => ({ gte: dateOnly(period.from), lte: dateOnly(period.to) });

/** Cash collected per property in one grouped query. */
export async function cashByProperty(
  organizationId: string,
  hostelIds: string[],
  period: Period,
  db: DbClient = prisma,
): Promise<Map<string, CashSums>> {
  const result = new Map<string, CashSums>();
  if (hostelIds.length === 0) return result;
  const rows = await db.payment.groupBy({
    by: ["hostelId", "type"],
    where: { organizationId, hostelId: { in: hostelIds }, status: "COMPLETED", paymentDate: periodWhere(period) },
    _sum: { amount: true },
  });
  for (const row of rows) {
    const sums = result.get(row.hostelId) ?? { ...EMPTY_CASH };
    const amount = toNumber(row._sum.amount);
    if (row.type === "PAYMENT") sums.payments = round2(sums.payments + amount);
    else if (row.type === "ADVANCE") sums.advances = round2(sums.advances + amount);
    else sums.refunds = round2(sums.refunds + amount);
    result.set(row.hostelId, sums);
  }
  return result;
}

/** Recorded expenses per property in one grouped query. */
export async function expensesByProperty(
  organizationId: string,
  hostelIds: string[],
  period: Period,
  db: DbClient = prisma,
): Promise<Map<string, number>> {
  if (hostelIds.length === 0) return new Map();
  const rows = await db.expense.groupBy({
    by: ["hostelId"],
    where: { organizationId, hostelId: { in: hostelIds }, status: "RECORDED", date: periodWhere(period) },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.hostelId, round2(toNumber(r._sum.amount))]));
}

/** Resolve `?from=&to=`: both given → validated custom period, otherwise last full month. */
export function resolveStatementPeriod(ctx: TenantContext, raw: { from?: string | null; to?: string | null } = {}): Period {
  if (raw.from && raw.to) return parseInput(statementPeriodSchema, { from: raw.from, to: raw.to });
  return lastMonth(todayInTimeZone(ctx.organization.timezone));
}

/** Rows listed on a statement are capped; totals always cover everything. */
export const STATEMENT_ROW_LIMIT = 500;

export async function getOwnerStatement(
  ctx: TenantContext,
  ownerId: string,
  raw: { from?: string | null; to?: string | null } = {},
) {
  requireOwners(ctx, "owners.view");
  const period = resolveStatementPeriod(ctx, raw);

  const owner = await prisma.propertyOwner.findFirst({
    where: { id: ownerId, ...ownerWhere(ctx) },
    select: {
      id: true,
      ownerCode: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      bankName: true,
      bankAccountTitle: true,
      bankAccountNumber: true,
      commissionPercent: true,
      archivedAt: true,
    },
  });
  if (!owner) throw new NotFoundError("Owner");

  const properties = await prisma.hostel.findMany({
    where: { ...accessiblePropertyWhere(ctx), ownerId: owner.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, archivedAt: true, managementFeePercent: true },
  });
  const ids = properties.map((p) => p.id);
  const range = periodWhere(period);

  const [cash, spent, paymentRows, expenseRows, payouts, organization] = await Promise.all([
    cashByProperty(ctx.organizationId, ids, period),
    expensesByProperty(ctx.organizationId, ids, period),
    ids.length
      ? prisma.payment.findMany({
          where: { organizationId: ctx.organizationId, hostelId: { in: ids }, status: "COMPLETED", paymentDate: range },
          orderBy: [{ paymentDate: "asc" }, { receiptNumber: "asc" }],
          take: STATEMENT_ROW_LIMIT + 1,
          select: {
            id: true,
            receiptNumber: true,
            paymentDate: true,
            type: true,
            method: true,
            amount: true,
            reference: true,
            hostelId: true,
            resident: { select: { firstName: true, lastName: true, residentCode: true } },
          },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.expense.findMany({
          where: { organizationId: ctx.organizationId, hostelId: { in: ids }, status: "RECORDED", date: range },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          take: STATEMENT_ROW_LIMIT + 1,
          select: {
            id: true,
            date: true,
            amount: true,
            vendor: true,
            description: true,
            reference: true,
            hostelId: true,
            category: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    prisma.ownerPayout.findMany({
      where: {
        organizationId: ctx.organizationId,
        ownerId: owner.id,
        status: { in: ["PENDING", "PAID"] satisfies OwnerPayoutStatus[] },
        periodStart: { lte: range.lte },
        periodEnd: { gte: range.gte },
      },
      orderBy: { periodStart: "desc" },
      select: { id: true, periodStart: true, periodEnd: true, status: true, netPayable: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true, brandName: true, logoFileId: true, address: true, city: true, country: true, phone: true, email: true, primaryColor: true },
    }),
  ]);

  const commission = toNumber(owner.commissionPercent);
  const { lines, totals } = computeStatementLines(
    properties.map((p) => ({ ...p, managementFeePercent: p.managementFeePercent === null ? null : toNumber(p.managementFeePercent) })),
    commission,
    cash,
    spent,
  );
  const propertyName = new Map(properties.map((p) => [p.id, p.name]));

  return serialize({
    owner: { ...owner, commissionPercent: commission },
    period,
    lines,
    totals,
    payments: paymentRows.slice(0, STATEMENT_ROW_LIMIT).map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      date: toDay(p.paymentDate),
      type: p.type,
      method: p.method,
      reference: p.reference,
      property: propertyName.get(p.hostelId) ?? "",
      resident: `${p.resident.firstName} ${p.resident.lastName}`.trim(),
      residentCode: p.resident.residentCode,
      /** Signed contribution to cash collected (refunds negative). */
      amount: p.type === "REFUND" ? -toNumber(p.amount) : toNumber(p.amount),
    })),
    paymentsTruncated: paymentRows.length > STATEMENT_ROW_LIMIT,
    expenses: expenseRows.slice(0, STATEMENT_ROW_LIMIT).map((e) => ({
      id: e.id,
      date: toDay(e.date),
      category: e.category.name,
      vendor: e.vendor,
      description: e.description,
      reference: e.reference,
      property: propertyName.get(e.hostelId) ?? "",
      amount: toNumber(e.amount),
    })),
    expensesTruncated: expenseRows.length > STATEMENT_ROW_LIMIT,
    overlappingPayouts: payouts.map((p) => ({
      id: p.id,
      from: toDay(p.periodStart),
      to: toDay(p.periodEnd),
      status: p.status,
      netPayable: toNumber(p.netPayable),
    })),
    organization: {
      name: organization.brandName || organization.name,
      legalName: organization.name,
      logoUrl: organization.logoFileId ? `/api/files/${organization.logoFileId}` : null,
      address: [organization.address, organization.city, organization.country].filter(Boolean).join(", ") || null,
      phone: organization.phone,
      email: organization.email,
      primaryColor: organization.primaryColor,
      currency: ctx.organization.currency,
      locale: ctx.organization.locale,
    },
    generatedAt: new Date(),
  });
}

export type OwnerStatement = Awaited<ReturnType<typeof getOwnerStatement>>;
