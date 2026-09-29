import { prisma, type Tx } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  accessWhere,
  actorOf,
  can,
  requireAnyPermission,
  requirePermission,
  scopedWhere,
  type TenantContext,
} from "@/lib/tenant/context";
import { invoiceSchema, voidSchema, type InvoiceInput } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { dateOnly, formatMoney, todayInTimeZone } from "@/lib/format";
import { EXPORT_ROW_LIMIT } from "@/lib/export";
import { notifyResident } from "@/lib/notifications/notify";
import { chargeTypeLabels } from "@/config/labels";
import { computeInvoiceTotals, deriveInvoiceStatus, getResidentBalance, markOverdueInvoices, nextInvoiceNumber, RECEIVABLE_STATUSES } from "./ledger";
import { getOrganizationBranding } from "./branding";

type ParsedInvoice = ReturnType<typeof invoiceSchema.parse>;

/** Statuses whose invoices may still be edited (and only while nothing is paid). */
const EDITABLE_STATUSES: InvoiceStatus[] = ["DRAFT", "PENDING", "OVERDUE"];

async function assertAssignmentForResident(tx: Tx, ctx: TenantContext, assignmentId: string, residentId: string) {
  const assignment = await tx.residentAssignment.findFirst({
    where: { id: assignmentId, residentId, organizationId: ctx.organizationId },
    select: { hostelId: true },
  });
  if (!assignment) throw new ValidationError("The selected stay does not belong to this resident.");
  return assignment;
}

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
    hostelId = (await assertAssignmentForResident(tx, ctx, input.assignmentId, resident.id)).hostelId;
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
          amount: round2(item.quantity * item.unitPrice),
          sortOrder: i,
        })),
      },
    },
    include: { items: true },
  });
  await audit(actorOf(ctx), { action: "invoice.created", entityType: "Invoice", entityId: invoice.id, after: invoice }, tx);
  return invoice;
}

function invoiceNotification(invoice: { id: string; invoiceNumber: string; total: Prisma.Decimal | number; dueDate: Date }, currency: string) {
  return {
    type: "INVOICE_CREATED" as const,
    title: `New invoice ${invoice.invoiceNumber}`,
    body: `Amount due: ${formatMoney(toNumber(invoice.total), currency)} by ${invoice.dueDate.toISOString().slice(0, 10)}`,
    link: `/portal/invoices/${invoice.id}`,
  };
}

export async function createInvoice(ctx: TenantContext, raw: InvoiceInput) {
  requirePermission(ctx, "invoices.manage");
  const input = parseInput(invoiceSchema, raw);
  const invoice = await prisma.$transaction((tx) => createInvoiceTx(tx, ctx, input));
  if (invoice.status !== "DRAFT") {
    await notifyResident(ctx.organizationId, invoice.residentId, invoiceNotification(invoice, ctx.organization.currency));
  }
  return serialize(invoice);
}

/** Edit an invoice that has no payments yet (draft, pending or overdue). */
export async function updateInvoice(ctx: TenantContext, id: string, raw: InvoiceInput) {
  requirePermission(ctx, "invoices.manage");
  const input = parseInput(invoiceSchema, raw);
  const { invoice, wasDraft } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.invoice.findFirst({ where: { id, ...accessWhere(ctx) }, include: { items: true } });
    if (!before) throw new NotFoundError("Invoice");
    if (before.status === "CANCELLED") throw new BusinessRuleError("Cancelled invoices cannot be edited.");
    if (toNumber(before.amountPaid) > 0) throw new BusinessRuleError("Invoices with payments cannot be edited. Void the payments first.");
    if (!EDITABLE_STATUSES.includes(before.status)) throw new BusinessRuleError("Only draft or unpaid invoices can be edited.");
    if (input.residentId !== before.residentId) throw new BusinessRuleError("The resident on an invoice cannot be changed.");
    if (before.status !== "DRAFT" && input.status === "DRAFT") {
      throw new BusinessRuleError("An issued invoice cannot be turned back into a draft. Cancel it instead.");
    }

    let hostelId = before.hostelId;
    if (input.assignmentId && input.assignmentId !== before.assignmentId) {
      hostelId = (await assertAssignmentForResident(tx, ctx, input.assignmentId, before.residentId)).hostelId;
    }

    let taxRate = 0;
    if (input.applyTax) {
      taxRate = toNumber(before.taxRate);
      if (taxRate === 0) {
        const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { taxRate: true } });
        taxRate = toNumber(org.taxRate);
      }
    }
    const totals = computeInvoiceTotals(input.items, input.discount, taxRate);
    const issueDate = dateOnly(input.issueDate);
    const dueDate = dateOnly(input.dueDate ?? before.dueDate);
    if (dueDate < issueDate) throw new ValidationError("Due date cannot be before the issue date", { dueDate: ["Due date cannot be before the issue date"] });

    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        hostelId,
        assignmentId: input.assignmentId ?? null,
        issueDate,
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
            description: item.description || chargeTypeLabels[item.type],
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: round2(item.quantity * item.unitPrice),
            sortOrder: i,
          })),
        },
      },
      include: { items: true },
    });
    await audit(actorOf(ctx), { action: "invoice.updated", entityType: "Invoice", entityId: id, before, after: updated }, tx);
    return { invoice: updated, wasDraft: before.status === "DRAFT" };
  });
  if (wasDraft && invoice.status !== "DRAFT") {
    await notifyResident(ctx.organizationId, invoice.residentId, invoiceNotification(invoice, ctx.organization.currency));
  }
  return serialize(invoice);
}

/** Issue a draft invoice (DRAFT → PENDING/OVERDUE/PAID). */
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
  await notifyResident(ctx.organizationId, invoice.residentId, invoiceNotification(invoice, ctx.organization.currency));
  return serialize(invoice);
}

/** Cancel an unpaid invoice. Invoices are never deleted. */
export async function cancelInvoice(ctx: TenantContext, id: string, rawReason: string) {
  requirePermission(ctx, "invoices.manage");
  const { reason } = parseInput(voidSchema, { reason: rawReason });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
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
    await audit(
      actorOf(ctx),
      {
        action: "invoice.cancelled",
        entityType: "Invoice",
        entityId: id,
        before: { status: before.status, cancelledAt: before.cancelledAt, cancelReason: before.cancelReason },
        after: { status: invoice.status, cancelledAt: invoice.cancelledAt, cancelReason: reason },
      },
      tx,
    );
    return serialize(invoice);
  });
}

// ─── Queries ────────────────────────────────────────────────────────────────

export const INVOICE_SORTS = ["number", "issueDate", "dueDate", "total"] as const;
export type InvoiceSort = (typeof INVOICE_SORTS)[number];

export type InvoiceListFilters = {
  q?: string;
  status?: InvoiceStatus | "RECEIVABLE";
  from?: Date;
  to?: Date;
  hostelId?: string;
  residentId?: string;
  sort?: InvoiceSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Case-insensitive match on number/resident name/code; every word must match. */
function invoiceSearch(q: string | undefined): Prisma.InvoiceWhereInput {
  const words = (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length === 0) return {};
  return {
    AND: words.map((w) => ({
      OR: [
        { invoiceNumber: { contains: w, mode: "insensitive" as const } },
        { resident: { firstName: { contains: w, mode: "insensitive" as const } } },
        { resident: { lastName: { contains: w, mode: "insensitive" as const } } },
        { resident: { residentCode: { contains: w, mode: "insensitive" as const } } },
      ],
    })),
  };
}

function invoiceWhere(ctx: TenantContext, f: InvoiceListFilters): Prisma.InvoiceWhereInput {
  return {
    ...scopedWhere(ctx, f.hostelId),
    ...(f.status === "RECEIVABLE" ? { status: { in: RECEIVABLE_STATUSES } } : f.status ? { status: f.status } : {}),
    ...(f.residentId ? { residentId: f.residentId } : {}),
    ...(f.from || f.to ? { issueDate: { ...(f.from ? { gte: dateOnly(f.from) } : {}), ...(f.to ? { lte: dateOnly(f.to) } : {}) } } : {}),
    ...invoiceSearch(f.q),
  };
}

function invoiceOrder(sort?: InvoiceSort, dir: "asc" | "desc" = "desc"): Prisma.InvoiceOrderByWithRelationInput[] {
  switch (sort) {
    case "number":
      return [{ invoiceNumber: dir }];
    case "dueDate":
      return [{ dueDate: dir }, { invoiceNumber: "desc" }];
    case "total":
      return [{ total: dir }, { invoiceNumber: "desc" }];
    case "issueDate":
      return [{ issueDate: dir }, { invoiceNumber: "desc" }];
    default:
      return [{ issueDate: "desc" }, { invoiceNumber: "desc" }];
  }
}

const invoiceListInclude = {
  resident: { select: { id: true, firstName: true, lastName: true, residentCode: true } },
  hostel: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceListRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceListInclude }>;

function toListRow(i: InvoiceListRow) {
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    status: i.status,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    periodStart: i.periodStart,
    periodEnd: i.periodEnd,
    total: toNumber(i.total),
    amountPaid: toNumber(i.amountPaid),
    balance: i.status === "CANCELLED" || i.status === "DRAFT" ? 0 : round2(toNumber(i.total) - toNumber(i.amountPaid)),
    resident: {
      id: i.resident.id,
      name: `${i.resident.firstName} ${i.resident.lastName}`.trim(),
      code: i.resident.residentCode,
    },
    hostel: i.hostel,
  };
}

export type InvoiceListItem = ReturnType<typeof toListRow>;

export async function listInvoices(ctx: TenantContext, filters: InvoiceListFilters = {}) {
  requirePermission(ctx, "invoices.view");
  await markOverdueInvoices(ctx.organizationId, ctx.organization.timezone);
  const { skip, take, page, pageSize } = paginate(filters);
  const where = invoiceWhere(ctx, filters);
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({ where, include: invoiceListInclude, orderBy: invoiceOrder(filters.sort, filters.dir), skip, take }),
    prisma.invoice.count({ where }),
  ]);
  return toPaginated(rows.map(toListRow), total, page, pageSize);
}

export async function listInvoicesForExport(ctx: TenantContext, filters: InvoiceListFilters = {}) {
  requirePermission(ctx, "invoices.view");
  await markOverdueInvoices(ctx.organizationId, ctx.organization.timezone);
  const rows = await prisma.invoice.findMany({
    where: invoiceWhere(ctx, filters),
    include: invoiceListInclude,
    orderBy: invoiceOrder(filters.sort, filters.dir),
    take: EXPORT_ROW_LIMIT,
  });
  return rows.map(toListRow);
}

/** Headline numbers for the invoice list (honours the hostel switcher). */
export async function getInvoiceStats(ctx: TenantContext, hostelId?: string) {
  requirePermission(ctx, "invoices.view");
  const groups = await prisma.invoice.groupBy({
    by: ["status"],
    where: scopedWhere(ctx, hostelId),
    _sum: { total: true, amountPaid: true },
    _count: { _all: true },
  });
  const pick = (s: InvoiceStatus) => groups.find((g) => g.status === s);
  const balanceOf = (statuses: InvoiceStatus[]) =>
    round2(statuses.reduce((sum, s) => sum + toNumber(pick(s)?._sum.total) - toNumber(pick(s)?._sum.amountPaid), 0));
  const countOf = (statuses: InvoiceStatus[]) => statuses.reduce((sum, s) => sum + (pick(s)?._count._all ?? 0), 0);
  return {
    outstanding: balanceOf(RECEIVABLE_STATUSES),
    outstandingCount: countOf(RECEIVABLE_STATUSES),
    overdue: balanceOf(["OVERDUE"]),
    overdueCount: countOf(["OVERDUE"]),
    draftCount: countOf(["DRAFT"]),
    paidCount: countOf(["PAID"]),
  };
}

export async function getInvoice(ctx: TenantContext, id: string) {
  requireAnyPermission(ctx, "invoices.view", "payments.manage");
  await markOverdueInvoices(ctx.organizationId, ctx.organization.timezone);
  const invoice = await prisma.invoice.findFirst({
    where: { id, ...accessWhere(ctx) },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      resident: {
        select: { id: true, firstName: true, lastName: true, residentCode: true, phone: true, email: true, address: true, city: true },
      },
      hostel: { select: { id: true, name: true, code: true, address: true, city: true, phone: true, email: true } },
      assignment: {
        select: { id: true, status: true, room: { select: { roomNumber: true } }, bed: { select: { bedNumber: true } } },
      },
      createdBy: { select: { name: true } },
      payments: {
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          receiptNumber: true,
          amount: true,
          method: true,
          type: true,
          status: true,
          reference: true,
          paymentDate: true,
          voidReason: true,
          receivedBy: { select: { name: true } },
          onlinePayment: { select: { provider: true } },
        },
      },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice");
  const [balance, organization] = await Promise.all([
    getResidentBalance(ctx.organizationId, invoice.residentId),
    getOrganizationBranding(ctx),
  ]);
  const amountDue =
    invoice.status === "CANCELLED" || invoice.status === "DRAFT" ? 0 : round2(toNumber(invoice.total) - toNumber(invoice.amountPaid));
  return serialize({
    ...invoice,
    balance: amountDue,
    residentCredit: balance.credit,
    organization,
    canEdit: EDITABLE_STATUSES.includes(invoice.status) && toNumber(invoice.amountPaid) === 0,
  });
}

export type InvoiceDetail = Awaited<ReturnType<typeof getInvoice>>;

/** Data the invoice form needs from the organization. */
export async function getInvoiceFormDefaults(ctx: TenantContext) {
  requirePermission(ctx, "invoices.manage");
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { taxRate: true, taxLabel: true, invoiceDueDays: true },
  });
  return {
    taxRate: toNumber(org.taxRate),
    taxLabel: org.taxLabel || "Tax",
    invoiceDueDays: org.invoiceDueDays,
    today: todayInTimeZone(ctx.organization.timezone),
  };
}

/** Load an invoice for the edit form, or throw if it can no longer be edited. */
export async function getInvoiceForEdit(ctx: TenantContext, id: string) {
  requirePermission(ctx, "invoices.manage");
  const invoice = await prisma.invoice.findFirst({
    where: { id, ...accessWhere(ctx) },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      resident: { select: { id: true, firstName: true, lastName: true, residentCode: true, hostelId: true } },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice");
  const editable = EDITABLE_STATUSES.includes(invoice.status) && toNumber(invoice.amountPaid) === 0;
  return serialize({ ...invoice, editable });
}

/** Whether the viewer may open the resident profile (accountants may not). */
export function canViewResidents(ctx: TenantContext) {
  return can(ctx, "residents.view");
}
