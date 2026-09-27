import { prisma, type DbClient } from "@/lib/db/prisma";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { nextSequence, formatNumber } from "@/lib/sequence";
import { round2, toNumber } from "@/lib/serialize";
import { dateOnly, todayInTimeZone } from "@/lib/format";

/**
 * Shared financial primitives. All money math is rounded to 2 decimals.
 *
 * Resident balance model:
 *   outstanding = Σ (invoice.total − invoice.amountPaid) for PENDING / PARTIALLY_PAID / OVERDUE invoices
 *   credit      = Σ ADVANCE payments (positive when received, negative when applied to an invoice)
 *   balance     = outstanding − credit    (positive = resident owes money)
 * REFUND payments (e.g. deposit refunds) are cash out and don't affect invoice balances.
 */

export const RECEIVABLE_STATUSES: InvoiceStatus[] = ["PENDING", "PARTIALLY_PAID", "OVERDUE"];

export async function nextInvoiceNumber(db: DbClient, organizationId: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { invoicePrefix: true } });
  return formatNumber(org.invoicePrefix || "INV", await nextSequence(db, organizationId, "invoice"), 5);
}

export async function nextReceiptNumber(db: DbClient, organizationId: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { receiptPrefix: true } });
  return formatNumber(org.receiptPrefix || "RCP", await nextSequence(db, organizationId, "receipt"), 5);
}

export { computeInvoiceTotals, lineAmount, type LineItem } from "./totals";

/** Status after a payment change. Draft and cancelled invoices keep their status. */
export function deriveInvoiceStatus(invoice: {
  status: InvoiceStatus;
  total: number;
  amountPaid: number;
  dueDate: Date;
  today?: Date;
}): InvoiceStatus {
  if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") return invoice.status;
  const balance = round2(invoice.total - invoice.amountPaid);
  if (balance <= 0) return "PAID";
  const today = invoice.today ?? dateOnly(new Date());
  if (invoice.dueDate < today) return "OVERDUE";
  if (invoice.amountPaid > 0) return "PARTIALLY_PAID";
  return "PENDING";
}

/**
 * Flip unpaid invoices past their due date to OVERDUE. Cheap single UPDATE,
 * called lazily when finance screens load (and safe to run from a cron).
 */
export async function markOverdueInvoices(organizationId: string, timezone = "UTC", db: DbClient = prisma) {
  const today = dateOnly(todayInTimeZone(timezone));
  await db.invoice.updateMany({
    where: { organizationId, status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lt: today } },
    data: { status: "OVERDUE" },
  });
}

export type ResidentBalance = { outstanding: number; credit: number; balance: number; overdue: number };

/**
 * Balances for many residents in three grouped queries (no N+1). Queries run
 * sequentially so this is safe inside an interactive transaction (a pg client
 * must not run concurrent queries).
 */
export async function getResidentBalances(
  organizationId: string,
  residentIds: string[],
  db: DbClient = prisma,
): Promise<Map<string, ResidentBalance>> {
  const result = new Map<string, ResidentBalance>();
  if (residentIds.length === 0) return result;
  const invoices = await db.invoice.groupBy({
      by: ["residentId"],
      where: { organizationId, residentId: { in: residentIds }, status: { in: RECEIVABLE_STATUSES } },
      _sum: { total: true, amountPaid: true },
    });
  const overdue = await db.invoice.groupBy({
      by: ["residentId"],
      where: { organizationId, residentId: { in: residentIds }, status: "OVERDUE" },
      _sum: { total: true, amountPaid: true },
    });
  const advances = await db.payment.groupBy({
      by: ["residentId"],
      where: { organizationId, residentId: { in: residentIds }, type: "ADVANCE", status: "COMPLETED" },
      _sum: { amount: true },
    });
  for (const id of residentIds) {
    const inv = invoices.find((i) => i.residentId === id);
    const od = overdue.find((i) => i.residentId === id);
    const adv = advances.find((a) => a.residentId === id);
    const outstanding = round2(toNumber(inv?._sum.total) - toNumber(inv?._sum.amountPaid));
    const credit = round2(toNumber(adv?._sum.amount));
    result.set(id, {
      outstanding,
      credit,
      balance: round2(outstanding - credit),
      overdue: round2(toNumber(od?._sum.total) - toNumber(od?._sum.amountPaid)),
    });
  }
  return result;
}

export async function getResidentBalance(organizationId: string, residentId: string, db: DbClient = prisma) {
  return (await getResidentBalances(organizationId, [residentId], db)).get(residentId)!;
}
