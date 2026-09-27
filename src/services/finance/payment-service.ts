import { prisma, type Tx } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { accessWhere, actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { paymentSchema, refundSchema, voidSchema, type PaymentInput, type RefundInput } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { dateOnly, formatMoney } from "@/lib/format";
import { notifyResident } from "@/lib/notifications/notify";
import { deriveInvoiceStatus, getResidentBalance, nextReceiptNumber } from "./ledger";

type ParsedPayment = ReturnType<typeof paymentSchema.parse>;

/** Lock the invoice row so concurrent payments cannot overpay it. */
async function lockInvoice(tx: Tx, invoiceId: string) {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
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
 * plus a negative ADVANCE entry consuming the credit.
 */
export async function applyCreditToInvoice(ctx: TenantContext, invoiceId: string) {
  requirePermission(ctx, "payments.manage");
  return prisma.$transaction(async (tx) => {
    await lockInvoice(tx, invoiceId);
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, ...accessWhere(ctx) } });
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") throw new BusinessRuleError("Credit can only be applied to issued invoices.");
    const { credit } = await getResidentBalance(ctx.organizationId, invoice.residentId, tx);
    const balance = round2(toNumber(invoice.total) - toNumber(invoice.amountPaid));
    const amount = round2(Math.min(credit, balance));
    if (amount <= 0) throw new BusinessRuleError("There is no credit available to apply.");
    const today = dateOnly(new Date());

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
        reference: "Advance credit",
        paymentDate: today,
        notes: "Applied from advance credit",
        receivedById: ctx.userId,
      },
    });
    await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        hostelId: invoice.hostelId,
        residentId: invoice.residentId,
        receiptNumber: await nextReceiptNumber(tx, ctx.organizationId),
        type: "ADVANCE",
        amount: -amount,
        method: "OTHER",
        reference: invoice.invoiceNumber,
        paymentDate: today,
        notes: `Credit applied to ${invoice.invoiceNumber}`,
        receivedById: ctx.userId,
      },
    });
    const amountPaid = round2(toNumber(invoice.amountPaid) + amount);
    const status = deriveInvoiceStatus({ status: invoice.status, total: toNumber(invoice.total), amountPaid, dueDate: invoice.dueDate });
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, status } });
    await audit(actorOf(ctx), { action: "payment.credit_applied", entityType: "Invoice", entityId: invoice.id, after: { amount, amountPaid, status } }, tx);
    return serialize(payment);
  });
}

/** Void a payment (financial records are never deleted). Reverses its effect on the invoice. */
export async function voidPayment(ctx: TenantContext, id: string, rawReason: string) {
  requirePermission(ctx, "payments.manage");
  const { reason } = parseInput(voidSchema, { reason: rawReason });
  return prisma.$transaction(async (tx) => {
    const before = await tx.payment.findFirst({ where: { id, ...accessWhere(ctx) } });
    if (!before) throw new NotFoundError("Payment");
    if (before.status === "VOIDED") throw new BusinessRuleError("This payment is already voided.");
    if (before.type === "ADVANCE" && toNumber(before.amount) > 0) {
      const { credit } = await getResidentBalance(ctx.organizationId, before.residentId, tx);
      if (credit < toNumber(before.amount)) {
        throw new BusinessRuleError("Part of this advance has already been applied to invoices and cannot be voided.");
      }
    }
    if (before.invoiceId) {
      await lockInvoice(tx, before.invoiceId);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: before.invoiceId } });
      const amountPaid = round2(Math.max(0, toNumber(invoice.amountPaid) - toNumber(before.amount)));
      const status = deriveInvoiceStatus({ status: invoice.status, total: toNumber(invoice.total), amountPaid, dueDate: invoice.dueDate });
      await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, status } });
    }
    const payment = await tx.payment.update({
      where: { id },
      data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason },
    });
    await audit(actorOf(ctx), { action: "payment.voided", entityType: "Payment", entityId: id, before, after: payment }, tx);
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
