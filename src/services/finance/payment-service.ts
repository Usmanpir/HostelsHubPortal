import { prisma, type Tx } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod, PaymentStatus, PaymentType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { accessWhere, actorOf, requireAnyPermission, requirePermission, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import { paymentSchema, refundSchema, voidSchema, type PaymentInput, type RefundInput } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { dateOnly, formatMoney, todayInTimeZone } from "@/lib/format";
import { EXPORT_ROW_LIMIT } from "@/lib/export";
import { notifyResident } from "@/lib/notifications/notify";
import { deriveInvoiceStatus, getResidentBalance, nextReceiptNumber } from "./ledger";
import { getOrganizationBranding } from "./branding";

type ParsedPayment = ReturnType<typeof paymentSchema.parse>;

/** Reference stored on PAYMENT rows created by applying advance credit. */
const CREDIT_REFERENCE = "Advance credit";

/** Lock the invoice row so concurrent payments cannot overpay it. */
async function lockInvoice(tx: Tx, invoiceId: string) {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
}

/** Serialize credit movements per resident (apply/void races). */
async function lockResidentCredit(tx: Tx, residentId: string) {
  await tx.$queryRaw`SELECT id FROM "Resident" WHERE id = ${residentId} FOR UPDATE`;
}

/**
 * Record a payment inside a transaction.
 *  - With invoiceId: applied to the invoice; may not exceed its balance unless
 *    `recordExcessAsAdvance` is set, in which case the excess becomes credit.
 *  - Without invoiceId: recorded as an ADVANCE (credit on the resident account).
 */
export async function recordPaymentTx(tx: Tx, ctx: TenantContext, input: ParsedPayment) {
  const resident = await tx.resident.findFirst({
    where: { id: input.residentId, ...accessWhere(ctx) },
    select: { id: true, hostelId: true },
  });
  if (!resident) throw new NotFoundError("Resident");
  const paymentDate = dateOnly(input.paymentDate);
  const created = [];

  if (!input.invoiceId) {
    const advance = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: resident.hostelId,
        residentId: resident.id,
        receiptNumber: await nextReceiptNumber(tx, ctx.organizationId),
        type: "ADVANCE",
        amount: input.amount,
        method: input.method,
        reference: input.reference ?? null,
        paymentDate,
        notes: input.notes ?? "Advance payment",
        receivedById: ctx.userId,
      },
    });
    await audit(actorOf(ctx), { action: "payment.created", entityType: "Payment", entityId: advance.id, after: advance }, tx);
    return [advance];
  }

  await lockInvoice(tx, input.invoiceId);
  const invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, ...accessWhere(ctx) } });
  if (!invoice || invoice.residentId !== resident.id) throw new NotFoundError("Invoice");
  if (invoice.status === "CANCELLED") throw new BusinessRuleError("Payments cannot be recorded against a cancelled invoice.");
  if (invoice.status === "DRAFT") throw new BusinessRuleError("Issue this draft invoice before recording payments.");

  const balance = round2(toNumber(invoice.total) - toNumber(invoice.amountPaid));
  if (balance <= 0) throw new BusinessRuleError("This invoice is already fully paid.");
  let applied = input.amount;
  let excess = 0;
  if (input.amount > balance) {
    if (!input.recordExcessAsAdvance) {
      throw new BusinessRuleError(
        `Payment exceeds the invoice balance of ${balance.toFixed(2)}. Reduce the amount or record the excess as advance credit.`,
      );
    }
    applied = balance;
    excess = round2(input.amount - balance);
  }

  const payment = await tx.payment.create({
    data: {
      organizationId: ctx.organizationId,
      hostelId: invoice.hostelId,
      residentId: resident.id,
      invoiceId: invoice.id,
      receiptNumber: await nextReceiptNumber(tx, ctx.organizationId),
      type: "PAYMENT",
      amount: applied,
      method: input.method,
      reference: input.reference ?? null,
      paymentDate,
      notes: input.notes ?? null,
      receivedById: ctx.userId,
    },
  });
  created.push(payment);

  const amountPaid = round2(toNumber(invoice.amountPaid) + applied);
  const status = deriveInvoiceStatus({ status: invoice.status, total: toNumber(invoice.total), amountPaid, dueDate: invoice.dueDate });
  await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, status } });
  await audit(
    actorOf(ctx),
    {
      action: "payment.created",
      entityType: "Payment",
      entityId: payment.id,
      after: payment,
      metadata: { invoice: { id: invoice.id, before: { amountPaid: invoice.amountPaid, status: invoice.status }, after: { amountPaid, status } } },
    },
    tx,
  );

  if (excess > 0) {
    const advance = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: invoice.hostelId,
        residentId: resident.id,
        receiptNumber: await nextReceiptNumber(tx, ctx.organizationId),
        type: "ADVANCE",
        amount: excess,
        method: input.method,
        reference: input.reference ?? null,
        paymentDate,
        notes: `Excess from payment ${payment.receiptNumber} kept as credit`,
        receivedById: ctx.userId,
      },
    });
    await audit(actorOf(ctx), { action: "payment.created", entityType: "Payment", entityId: advance.id, after: advance }, tx);
    created.push(advance);
  }
  return created;
}

export async function recordPayment(ctx: TenantContext, raw: PaymentInput) {
  requirePermission(ctx, "payments.manage");
  const input = parseInput(paymentSchema, raw);
  const payments = await prisma.$transaction((tx) => recordPaymentTx(tx, ctx, input));
  const total = payments.reduce((s, p) => s + toNumber(p.amount), 0);
  await notifyResident(ctx.organizationId, input.residentId, {
    type: "PAYMENT_RECEIVED",
    title: "Payment received",
    body: `We received ${formatMoney(total, ctx.organization.currency)}. Receipt ${payments[0]!.receiptNumber}.`,
    link: `/portal/payments`,
  });
  return serialize(payments);
}

/**
 * Apply a resident's advance credit to an invoice: a PAYMENT on the invoice
 * plus a negative ADVANCE entry consuming the credit. The negative entry's
 * `reference` is the PAYMENT's receipt number so voiding one reverses both.
 */
export async function applyCreditToInvoice(ctx: TenantContext, invoiceId: string) {
  requirePermission(ctx, "payments.manage");
  return prisma.$transaction(async (tx) => {
    await lockInvoice(tx, invoiceId);
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, ...accessWhere(ctx) } });
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") throw new BusinessRuleError("Credit can only be applied to issued invoices.");
    await lockResidentCredit(tx, invoice.residentId);
    const { credit } = await getResidentBalance(ctx.organizationId, invoice.residentId, tx);
    const balance = round2(toNumber(invoice.total) - toNumber(invoice.amountPaid));
    const amount = round2(Math.min(credit, balance));
    if (amount <= 0) throw new BusinessRuleError(balance <= 0 ? "This invoice is already fully paid." : "There is no credit available to apply.");
    const today = dateOnly(todayInTimeZone(ctx.organization.timezone));

    const payment = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: invoice.hostelId,
        residentId: invoice.residentId,
        invoiceId: invoice.id,
        receiptNumber: await nextReceiptNumber(tx, ctx.organizationId),
        type: "PAYMENT",
        amount,
        method: "OTHER",
        reference: CREDIT_REFERENCE,
        paymentDate: today,
        notes: "Applied from advance credit",
        receivedById: ctx.userId,
      },
    });
    const consumption = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: invoice.hostelId,
        residentId: invoice.residentId,
        receiptNumber: await nextReceiptNumber(tx, ctx.organizationId),
        type: "ADVANCE",
        amount: -amount,
        method: "OTHER",
        reference: payment.receiptNumber,
        paymentDate: today,
        notes: `Credit applied to ${invoice.invoiceNumber}`,
        receivedById: ctx.userId,
      },
    });
    const amountPaid = round2(toNumber(invoice.amountPaid) + amount);
    const status = deriveInvoiceStatus({ status: invoice.status, total: toNumber(invoice.total), amountPaid, dueDate: invoice.dueDate });
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, status } });
    await audit(
      actorOf(ctx),
      {
        action: "payment.credit_applied",
        entityType: "Invoice",
        entityId: invoice.id,
        before: { amountPaid: invoice.amountPaid, status: invoice.status, residentCredit: credit },
        after: { amountPaid, status, residentCredit: round2(credit - amount) },
        metadata: { amount, paymentId: payment.id, creditEntryId: consumption.id },
      },
      tx,
    );
    return serialize(payment);
  });
}

/** Find the negative ADVANCE that consumed credit for a credit-application PAYMENT. */
async function findCreditConsumption(
  tx: Tx,
  payment: { organizationId: string; residentId: string; receiptNumber: string; amount: Prisma.Decimal; paymentDate: Date },
  invoiceNumber: string | null,
) {
  const base = {
    organizationId: payment.organizationId,
    residentId: payment.residentId,
    type: "ADVANCE" as const,
    status: "COMPLETED" as const,
    amount: -toNumber(payment.amount),
  };
  const linked = await tx.payment.findFirst({ where: { ...base, reference: payment.receiptNumber } });
  if (linked || !invoiceNumber) return linked;
  // Entries created before receipt linking referenced the invoice number instead.
  return tx.payment.findFirst({ where: { ...base, reference: invoiceNumber, paymentDate: payment.paymentDate }, orderBy: { createdAt: "asc" } });
}

/** Void a payment (financial records are never deleted). Reverses its effect on the invoice. */
export async function voidPayment(ctx: TenantContext, id: string, rawReason: string) {
  requirePermission(ctx, "payments.manage");
  const { reason } = parseInput(voidSchema, { reason: rawReason });
  return prisma.$transaction(async (tx) => {
    // Row lock so two concurrent voids cannot both reverse the invoice.
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.payment.findFirst({ where: { id, ...accessWhere(ctx) } });
    if (!before) throw new NotFoundError("Payment");
    if (before.status === "VOIDED") throw new BusinessRuleError("This payment is already voided.");
    if (before.type === "ADVANCE" && toNumber(before.amount) < 0) {
      throw new BusinessRuleError("This entry records credit applied to an invoice. Void the matching credit payment on that invoice instead.");
    }
    // Lock order everywhere: invoice row first, then the resident (credit) row.
    if (before.invoiceId) await lockInvoice(tx, before.invoiceId);
    await lockResidentCredit(tx, before.residentId);
    if (before.type === "ADVANCE" && toNumber(before.amount) > 0) {
      const { credit } = await getResidentBalance(ctx.organizationId, before.residentId, tx);
      if (credit < toNumber(before.amount)) {
        throw new BusinessRuleError("Part of this advance has already been applied to invoices and cannot be voided.");
      }
    }

    let invoiceChange: Record<string, unknown> | undefined;
    let reversedCredit: { id: string; receiptNumber: string } | null = null;
    if (before.invoiceId) {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: before.invoiceId } });
      const amountPaid = round2(Math.max(0, toNumber(invoice.amountPaid) - toNumber(before.amount)));
      const status = deriveInvoiceStatus({ status: invoice.status, total: toNumber(invoice.total), amountPaid, dueDate: invoice.dueDate });
      await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, status } });
      invoiceChange = { id: invoice.id, before: { amountPaid: invoice.amountPaid, status: invoice.status }, after: { amountPaid, status } };

      if (before.type === "PAYMENT" && before.reference === CREDIT_REFERENCE && before.method === "OTHER") {
        // Give the credit back by voiding the consumption entry.
        const consumption = await findCreditConsumption(tx, before, invoice.invoiceNumber);
        if (consumption) {
          await tx.payment.update({
            where: { id: consumption.id },
            data: { status: "VOIDED", voidedAt: new Date(), voidReason: `Reversed with ${before.receiptNumber}: ${reason}` },
          });
          reversedCredit = { id: consumption.id, receiptNumber: consumption.receiptNumber };
        }
      }
    }
    const payment = await tx.payment.update({
      where: { id },
      data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason },
    });
    await audit(
      actorOf(ctx),
      {
        action: "payment.voided",
        entityType: "Payment",
        entityId: id,
        before,
        after: payment,
        metadata: { ...(invoiceChange ? { invoice: invoiceChange } : {}), ...(reversedCredit ? { creditRestored: reversedCredit } : {}) },
      },
      tx,
    );
    return serialize(payment);
  });
}

/** Record money paid back to a resident (e.g. security deposit refund). */
export async function recordRefundTx(tx: Tx, ctx: TenantContext, raw: RefundInput) {
  const input = parseInput(refundSchema, raw);
  const resident = await tx.resident.findFirst({ where: { id: input.residentId, ...accessWhere(ctx) }, select: { id: true, hostelId: true } });
  if (!resident) throw new NotFoundError("Resident");
  const refund = await tx.payment.create({
    data: {
      organizationId: ctx.organizationId,
      hostelId: resident.hostelId,
      residentId: resident.id,
      receiptNumber: await nextReceiptNumber(tx, ctx.organizationId),
      type: "REFUND",
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      paymentDate: dateOnly(input.paymentDate),
      notes: input.notes ?? "Refund",
      receivedById: ctx.userId,
    },
  });
  await audit(actorOf(ctx), { action: "payment.refund_created", entityType: "Payment", entityId: refund.id, after: refund }, tx);
  return refund;
}

export async function recordRefund(ctx: TenantContext, raw: RefundInput) {
  requirePermission(ctx, "payments.manage");
  return serialize(await prisma.$transaction((tx) => recordRefundTx(tx, ctx, raw)));
}

// ─── Queries ────────────────────────────────────────────────────────────────

export const PAYMENT_SORTS = ["date", "amount", "receipt"] as const;
export type PaymentSort = (typeof PAYMENT_SORTS)[number];

export type PaymentListFilters = {
  q?: string;
  method?: PaymentMethod;
  type?: PaymentType;
  status?: PaymentStatus;
  from?: Date;
  to?: Date;
  hostelId?: string;
  residentId?: string;
  invoiceId?: string;
  sort?: PaymentSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

function paymentWhere(ctx: TenantContext, f: PaymentListFilters): Prisma.PaymentWhereInput {
  const words = (f.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    ...scopedWhere(ctx, f.hostelId),
    ...(f.method ? { method: f.method } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.residentId ? { residentId: f.residentId } : {}),
    ...(f.invoiceId ? { invoiceId: f.invoiceId } : {}),
    ...(f.from || f.to ? { paymentDate: { ...(f.from ? { gte: dateOnly(f.from) } : {}), ...(f.to ? { lte: dateOnly(f.to) } : {}) } } : {}),
    ...(words.length
      ? {
          AND: words.map((w) => ({
            OR: [
              { receiptNumber: { contains: w, mode: "insensitive" as const } },
              { reference: { contains: w, mode: "insensitive" as const } },
              { invoice: { invoiceNumber: { contains: w, mode: "insensitive" as const } } },
              { resident: { firstName: { contains: w, mode: "insensitive" as const } } },
              { resident: { lastName: { contains: w, mode: "insensitive" as const } } },
              { resident: { residentCode: { contains: w, mode: "insensitive" as const } } },
            ],
          })),
        }
      : {}),
  };
}

function paymentOrder(sort?: PaymentSort, dir: "asc" | "desc" = "desc"): Prisma.PaymentOrderByWithRelationInput[] {
  switch (sort) {
    case "amount":
      return [{ amount: dir }, { createdAt: "desc" }];
    case "receipt":
      return [{ receiptNumber: dir }];
    case "date":
      return [{ paymentDate: dir }, { createdAt: dir }];
    default:
      return [{ paymentDate: "desc" }, { createdAt: "desc" }];
  }
}

const paymentListInclude = {
  resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
  hostel: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
  receivedBy: { select: { name: true } },
  onlinePayment: { select: { provider: true } },
} satisfies Prisma.PaymentInclude;

type PaymentListRow = Prisma.PaymentGetPayload<{ include: typeof paymentListInclude }>;

function toPaymentRow(p: PaymentListRow) {
  return {
    id: p.id,
    receiptNumber: p.receiptNumber,
    paymentDate: p.paymentDate,
    type: p.type,
    status: p.status,
    method: p.method,
    amount: toNumber(p.amount),
    reference: p.reference,
    notes: p.notes,
    resident: { id: p.resident.id, name: `${p.resident.firstName} ${p.resident.lastName}`.trim(), code: p.resident.residentCode },
    hostel: p.hostel,
    invoice: p.invoice,
    receivedBy: p.receivedBy?.name ?? null,
    onlineProvider: p.onlinePayment?.provider ?? null,
  };
}

export type PaymentListItem = ReturnType<typeof toPaymentRow>;

export async function listPayments(ctx: TenantContext, filters: PaymentListFilters = {}) {
  requirePermission(ctx, "payments.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where = paymentWhere(ctx, filters);
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({ where, include: paymentListInclude, orderBy: paymentOrder(filters.sort, filters.dir), skip, take }),
    prisma.payment.count({ where }),
  ]);
  return toPaginated(rows.map(toPaymentRow), total, page, pageSize);
}

export async function listPaymentsForExport(ctx: TenantContext, filters: PaymentListFilters = {}) {
  requirePermission(ctx, "payments.view");
  const rows = await prisma.payment.findMany({
    where: paymentWhere(ctx, filters),
    include: paymentListInclude,
    orderBy: paymentOrder(filters.sort, filters.dir),
    take: EXPORT_ROW_LIMIT,
  });
  return rows.map(toPaymentRow);
}

/** Cash totals for the current payment filters (completed rows only). */
export async function getPaymentTotals(ctx: TenantContext, filters: PaymentListFilters = {}) {
  requirePermission(ctx, "payments.view");
  const groups = await prisma.payment.groupBy({
    by: ["type"],
    where: { ...paymentWhere(ctx, { ...filters, status: undefined }), status: "COMPLETED" },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const sum = (t: PaymentType) => toNumber(groups.find((g) => g.type === t)?._sum.amount);
  const received = round2(sum("PAYMENT") + sum("ADVANCE"));
  const refunds = round2(sum("REFUND"));
  return {
    received,
    refunds,
    net: round2(received - refunds),
    count: groups.reduce((s, g) => s + g._count._all, 0),
  };
}

export async function getPayment(ctx: TenantContext, id: string) {
  requireAnyPermission(ctx, "payments.view", "payments.manage");
  const payment = await prisma.payment.findFirst({
    where: { id, ...accessWhere(ctx) },
    include: {
      resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true, email: true } },
      hostel: { select: { id: true, name: true, code: true, address: true, city: true, phone: true } },
      invoice: {
        select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true, issueDate: true, periodStart: true, periodEnd: true },
      },
      receivedBy: { select: { name: true } },
      onlinePayment: { select: { provider: true, txnRef: true, gatewayTxnId: true, environment: true } },
    },
  });
  if (!payment) throw new NotFoundError("Payment");
  const [organization, related] = await Promise.all([
    getOrganizationBranding(ctx),
    // Advance entries created alongside this receipt (excess kept as credit).
    payment.type === "PAYMENT"
      ? prisma.payment.findMany({
          where: {
            organizationId: ctx.organizationId,
            residentId: payment.residentId,
            type: "ADVANCE",
            notes: `Excess from payment ${payment.receiptNumber} kept as credit`,
          },
          select: { id: true, receiptNumber: true, amount: true, status: true },
        })
      : Promise.resolve([]),
  ]);
  const isCreditEntry = payment.type === "ADVANCE" && toNumber(payment.amount) < 0;
  return serialize({ ...payment, organization, related, isCreditEntry });
}

export type PaymentDetail = Awaited<ReturnType<typeof getPayment>>;
