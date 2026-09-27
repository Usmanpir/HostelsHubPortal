import { prisma, type Tx } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { accessWhere, actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { invoiceSchema, voidSchema, type InvoiceInput } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { serialize, toNumber } from "@/lib/serialize";
import { dateOnly } from "@/lib/format";
import { notifyResident } from "@/lib/notifications/notify";
import { chargeTypeLabels } from "@/config/labels";
import { computeInvoiceTotals, deriveInvoiceStatus, nextInvoiceNumber } from "./ledger";

type ParsedInvoice = ReturnType<typeof invoiceSchema.parse>;

/**
 * Core invoice creation inside an existing transaction. Used by the invoice
 * screens, bulk monthly billing and check-in (first invoice). The caller is
 * responsible for authorization; this function enforces tenant consistency.
 */
export async function createInvoiceTx(tx: Tx, ctx: TenantContext, input: ParsedInvoice) {
  const resident = await tx.resident.findFirst({
    where: { id: input.residentId, ...accessWhere(ctx) },
    select: { id: true, hostelId: true, firstName: true, lastName: true },
  });
  if (!resident) throw new NotFoundError("Resident");

  let hostelId = resident.hostelId;
  if (input.assignmentId) {
    const assignment = await tx.residentAssignment.findFirst({
      where: { id: input.assignmentId, residentId: resident.id, organizationId: ctx.organizationId },
      select: { hostelId: true },
    });
    if (!assignment) throw new ValidationError("The selected stay does not belong to this resident.");
    hostelId = assignment.hostelId;
  }

  const org = await tx.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { taxRate: true, invoiceDueDays: true },
  });
  const taxRate = input.applyTax ? toNumber(org.taxRate) : 0;
  const totals = computeInvoiceTotals(input.items, input.discount, taxRate);
  const issueDate = dateOnly(input.issueDate);
  const dueDate = dateOnly(input.dueDate ?? new Date(issueDate.getTime() + org.invoiceDueDays * 86400_000));

  const invoice = await tx.invoice.create({
    data: {
      organizationId: ctx.organizationId,
      hostelId,
      residentId: resident.id,
      assignmentId: input.assignmentId ?? null,
      invoiceNumber: await nextInvoiceNumber(tx, ctx.organizationId),
      issueDate,
      dueDate,
      periodStart: input.periodStart ? dateOnly(input.periodStart) : null,
      periodEnd: input.periodEnd ? dateOnly(input.periodEnd) : null,
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxRate,
      tax: totals.tax,
      total: totals.total,
      status: input.status === "DRAFT" ? "DRAFT" : deriveInvoiceStatus({ status: "PENDING", total: totals.total, amountPaid: 0, dueDate }),
      notes: input.notes ?? null,
      createdById: ctx.userId,
      items: {
        create: input.items.map((item, i) => ({
          type: item.type,
          description: item.description || chargeTypeLabels[item.type],
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
          sortOrder: i,
        })),
      },
    },
    include: { items: true },
  });
  await audit(actorOf(ctx), { action: "invoice.created", entityType: "Invoice", entityId: invoice.id, after: invoice }, tx);
  return invoice;
}

export async function createInvoice(ctx: TenantContext, raw: InvoiceInput) {
  requirePermission(ctx, "invoices.manage");
  const input = parseInput(invoiceSchema, raw);
  const invoice = await prisma.$transaction((tx) => createInvoiceTx(tx, ctx, input));
  if (invoice.status !== "DRAFT") {
    await notifyResident(ctx.organizationId, invoice.residentId, {
      type: "INVOICE_CREATED",
      title: `New invoice ${invoice.invoiceNumber}`,
      body: `Amount due: ${toNumber(invoice.total).toFixed(2)} by ${invoice.dueDate.toISOString().slice(0, 10)}`,
      link: `/portal/invoices/${invoice.id}`,
    });
  }
  return serialize(invoice);
}

/** Edit an invoice that has no payments yet (draft or pending). */
export async function updateInvoice(ctx: TenantContext, id: string, raw: InvoiceInput) {
  requirePermission(ctx, "invoices.manage");
  const input = parseInput(invoiceSchema, raw);
  return prisma.$transaction(async (tx) => {
    const before = await tx.invoice.findFirst({ where: { id, ...accessWhere(ctx) }, include: { items: true } });
    if (!before) throw new NotFoundError("Invoice");
    if (before.status === "CANCELLED") throw new BusinessRuleError("Cancelled invoices cannot be edited.");
    if (toNumber(before.amountPaid) > 0) throw new BusinessRuleError("Invoices with payments cannot be edited. Void the payments first.");
    if (input.residentId !== before.residentId) throw new BusinessRuleError("The resident on an invoice cannot be changed.");

    const taxRate = input.applyTax ? toNumber(before.taxRate) || toNumber((await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { taxRate: true } })).taxRate) : 0;
    const totals = computeInvoiceTotals(input.items, input.discount, taxRate);
    const dueDate = dateOnly(input.dueDate ?? before.dueDate);
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    const invoice = await tx.invoice.update({
      where: { id },
      data: {
        issueDate: dateOnly(input.issueDate),
        dueDate,
        periodStart: input.periodStart ? dateOnly(input.periodStart) : null,
        periodEnd: input.periodEnd ? dateOnly(input.periodEnd) : null,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxRate,
        tax: totals.tax,
        total: totals.total,
        notes: input.notes ?? null,
        status: input.status === "DRAFT" ? "DRAFT" : deriveInvoiceStatus({ status: "PENDING", total: totals.total, amountPaid: 0, dueDate }),
        items: {
          create: input.items.map((item, i) => ({
            type: item.type,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
            sortOrder: i,
          })),
        },
      },
      include: { items: true },
    });
    await audit(actorOf(ctx), { action: "invoice.updated", entityType: "Invoice", entityId: id, before, after: invoice }, tx);
    return serialize(invoice);
  });
}

/** Issue a draft invoice (DRAFT → PENDING/OVERDUE). */
export async function issueInvoice(ctx: TenantContext, id: string) {
  requirePermission(ctx, "invoices.manage");
  const invoice = await prisma.$transaction(async (tx) => {
    const before = await tx.invoice.findFirst({ where: { id, ...accessWhere(ctx) } });
    if (!before) throw new NotFoundError("Invoice");
    if (before.status !== "DRAFT") throw new BusinessRuleError("Only draft invoices can be issued.");
    const status = deriveInvoiceStatus({ status: "PENDING", total: toNumber(before.total), amountPaid: 0, dueDate: before.dueDate });
    const updated = await tx.invoice.update({ where: { id }, data: { status } });
    await audit(actorOf(ctx), { action: "invoice.issued", entityType: "Invoice", entityId: id, before: { status: before.status }, after: { status } }, tx);
    return updated;
  });
  await notifyResident(ctx.organizationId, invoice.residentId, {
    type: "INVOICE_CREATED",
    title: `New invoice ${invoice.invoiceNumber}`,
    link: `/portal/invoices/${invoice.id}`,
  });
  return serialize(invoice);
}

/** Cancel an unpaid invoice. Invoices are never deleted. */
export async function cancelInvoice(ctx: TenantContext, id: string, rawReason: string) {
  requirePermission(ctx, "invoices.manage");
  const { reason } = parseInput(voidSchema, { reason: rawReason });
  return prisma.$transaction(async (tx) => {
    const before = await tx.invoice.findFirst({ where: { id, ...accessWhere(ctx) } });
    if (!before) throw new NotFoundError("Invoice");
    if (before.status === "CANCELLED") throw new BusinessRuleError("This invoice is already cancelled.");
    if (toNumber(before.amountPaid) > 0) {
      throw new BusinessRuleError("This invoice has payments. Void the payments before cancelling it.");
    }
    const invoice = await tx.invoice.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    await audit(actorOf(ctx), { action: "invoice.cancelled", entityType: "Invoice", entityId: id, before: { status: before.status }, after: { status: "CANCELLED", reason } }, tx);
    return serialize(invoice);
  });
}
