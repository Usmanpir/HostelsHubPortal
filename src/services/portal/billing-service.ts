import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import type { ResidentContext } from "@/lib/tenant/resident";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { idSchema } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import type { PortalInvoiceFilter, PortalListInput } from "@/lib/validation/portal";
import { getResidentBalance, markOverdueInvoices, RECEIVABLE_STATUSES } from "@/services/finance/ledger";
import { ownWhere, parseList, toPaginated } from "./shared";

/** Residents never see drafts — those are still being prepared by the office. */
const VISIBLE_INVOICE: Prisma.InvoiceWhereInput = { status: { not: "DRAFT" } };

const FILTER_WHERE: Record<PortalInvoiceFilter, Prisma.InvoiceWhereInput> = {
  all: {},
  unpaid: { status: { in: RECEIVABLE_STATUSES } },
  paid: { status: "PAID" },
};

async function refreshOverdue(ctx: ResidentContext) {
  await markOverdueInvoices(ctx.organizationId, ctx.organization.timezone);
}

export async function getPortalBalance(ctx: ResidentContext) {
  return getResidentBalance(ctx.organizationId, ctx.residentId);
}

export async function listPortalInvoices(
  ctx: ResidentContext,
  filter: PortalInvoiceFilter = "all",
  raw?: PortalListInput,
) {
  await refreshOverdue(ctx);
  const { skip, take, page, pageSize } = parseList(raw);
  const where: Prisma.InvoiceWhereInput = { ...ownWhere(ctx), ...VISIBLE_INVOICE, ...(FILTER_WHERE[filter] ?? {}) };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        periodStart: true,
        periodEnd: true,
        total: true,
        amountPaid: true,
        status: true,
        hostel: { select: { name: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  const items = rows.map((r) => ({ ...r, balance: round2(toNumber(r.total) - toNumber(r.amountPaid)) }));
  return serialize(toPaginated(items, total, page, pageSize));
}

/** Earliest unpaid invoice — "next payment due" on the dashboard. */
export async function nextDueInvoice(ctx: ResidentContext) {
  const invoice = await prisma.invoice.findFirst({
    where: { ...ownWhere(ctx), status: { in: RECEIVABLE_STATUSES } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, invoiceNumber: true, dueDate: true, total: true, amountPaid: true, status: true },
  });
  if (!invoice) return null;
  return serialize({ ...invoice, balance: round2(toNumber(invoice.total) - toNumber(invoice.amountPaid)) });
}

const orgInvoiceSelect = {
  name: true,
  brandName: true,
  logoFileId: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  country: true,
  taxLabel: true,
  invoiceFooter: true,
} satisfies Prisma.OrganizationSelect;

export async function getPortalInvoice(ctx: ResidentContext, rawId: string) {
  const id = parseInput(idSchema, rawId);
  await refreshOverdue(ctx);
  const invoice = await prisma.invoice.findFirst({
    where: { id, ...ownWhere(ctx), ...VISIBLE_INVOICE },
    select: {
      id: true,
      invoiceNumber: true,
      issueDate: true,
      dueDate: true,
      periodStart: true,
      periodEnd: true,
      subtotal: true,
      discount: true,
      taxRate: true,
      tax: true,
      total: true,
      amountPaid: true,
      status: true,
      notes: true,
      cancelledAt: true,
      cancelReason: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, type: true, description: true, quantity: true, unitPrice: true, amount: true },
      },
      payments: {
        where: { status: "COMPLETED" },
        orderBy: { paymentDate: "asc" },
        select: { id: true, receiptNumber: true, paymentDate: true, amount: true, method: true, type: true },
      },
      hostel: { select: { name: true, address: true, city: true, phone: true, email: true } },
      resident: { select: { firstName: true, lastName: true, residentCode: true, phone: true, email: true } },
      organization: { select: orgInvoiceSelect },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice");
  return serialize({ ...invoice, balance: round2(toNumber(invoice.total) - toNumber(invoice.amountPaid)) });
}

/** Payments are shown as recorded by the office: completed receipts and voided ones (clearly marked). */
const VISIBLE_PAYMENT: Prisma.PaymentWhereInput = { status: { in: ["COMPLETED", "VOIDED"] } };

export async function listPortalPayments(ctx: ResidentContext, raw?: PortalListInput) {
  const { skip, take, page, pageSize } = parseList(raw);
  const where: Prisma.PaymentWhereInput = { ...ownWhere(ctx), ...VISIBLE_PAYMENT };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      select: {
        id: true,
        receiptNumber: true,
        type: true,
        status: true,
        amount: true,
        method: true,
        paymentDate: true,
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  return serialize(toPaginated(items, total, page, pageSize));
}

export async function recentPortalPayments(ctx: ResidentContext, take = 4) {
  const items = await prisma.payment.findMany({
    where: { ...ownWhere(ctx), status: "COMPLETED", amount: { gt: 0 } },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    take,
    select: { id: true, receiptNumber: true, type: true, amount: true, method: true, paymentDate: true },
  });
  return serialize(items);
}

export async function getPortalPayment(ctx: ResidentContext, rawId: string) {
  const id = parseInput(idSchema, rawId);
  const payment = await prisma.payment.findFirst({
    where: { id, ...ownWhere(ctx), ...VISIBLE_PAYMENT },
    select: {
      id: true,
      receiptNumber: true,
      type: true,
      status: true,
      amount: true,
      method: true,
      reference: true,
      paymentDate: true,
      notes: true,
      voidedAt: true,
      voidReason: true,
      createdAt: true,
      receivedBy: { select: { name: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true } },
      hostel: { select: { name: true, address: true, city: true, phone: true } },
      resident: { select: { firstName: true, lastName: true, residentCode: true } },
      organization: { select: orgInvoiceSelect },
    },
  });
  if (!payment) throw new NotFoundError("Payment");
  return serialize(payment);
}
