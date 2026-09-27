import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import { accessWhere, requireAnyPermission, type TenantContext } from "@/lib/tenant/context";
import { round2, toNumber } from "@/lib/serialize";
import { getResidentBalance, markOverdueInvoices, RECEIVABLE_STATUSES } from "./ledger";

/**
 * Resident lookups for billing screens. These deliberately require finance
 * permissions (not residents.view) so accountants can invoice and take
 * payments without seeing full resident profiles; only billing fields are returned.
 */

export type BillableResidentOption = {
  id: string;
  name: string;
  code: string;
  hostelId: string;
  hostelName: string;
  status: string;
};

export async function searchBillableResidents(ctx: TenantContext, rawQuery: string | undefined, limit = 20) {
  requireAnyPermission(ctx, "invoices.manage", "payments.manage");
  const words = (rawQuery ?? "").trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 4);
  const where: Prisma.ResidentWhereInput = {
    ...accessWhere(ctx),
    ...(ctx.activeHostelId ? { hostelId: ctx.activeHostelId } : {}),
    archivedAt: null,
    ...(words.length
      ? {
          AND: words.map((w) => ({
            OR: [
              { firstName: { contains: w, mode: "insensitive" as const } },
              { lastName: { contains: w, mode: "insensitive" as const } },
              { residentCode: { contains: w, mode: "insensitive" as const } },
              { phone: { contains: w } },
            ],
          })),
        }
      : {}),
  };
  const rows = await prisma.resident.findMany({
    where,
    orderBy: [{ status: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, firstName: true, lastName: true, residentCode: true, hostelId: true, status: true, hostel: { select: { name: true } } },
  });
  return rows.map<BillableResidentOption>((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    code: r.residentCode,
    hostelId: r.hostelId,
    hostelName: r.hostel.name,
    status: r.status,
  }));
}

/** Everything the invoice / payment forms need once a resident is chosen. */
export async function getResidentBillingContext(ctx: TenantContext, residentId: string) {
  requireAnyPermission(ctx, "invoices.manage", "payments.manage");
  await markOverdueInvoices(ctx.organizationId, ctx.organization.timezone);
  const resident = await prisma.resident.findFirst({
    where: { id: residentId, ...accessWhere(ctx) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      residentCode: true,
      status: true,
      hostel: { select: { id: true, name: true, rentDueDay: true } },
      assignments: {
        where: { status: { in: ["ACTIVE", "RESERVED"] } },
        orderBy: { checkInDate: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          monthlyRent: true,
          securityDeposit: true,
          checkInDate: true,
          hostel: { select: { id: true, name: true, rentDueDay: true } },
          room: { select: { roomNumber: true } },
          bed: { select: { bedNumber: true } },
        },
      },
    },
  });
  if (!resident) throw new NotFoundError("Resident");
  const [openInvoices, balance] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId: ctx.organizationId, residentId, status: { in: RECEIVABLE_STATUSES } },
      orderBy: [{ dueDate: "asc" }, { invoiceNumber: "asc" }],
      take: 50,
      select: { id: true, invoiceNumber: true, status: true, dueDate: true, issueDate: true, total: true, amountPaid: true, periodStart: true },
    }),
    getResidentBalance(ctx.organizationId, residentId),
  ]);
  const a = resident.assignments[0];
  return {
    resident: {
      id: resident.id,
      name: `${resident.firstName} ${resident.lastName}`.trim(),
      code: resident.residentCode,
      status: resident.status,
      hostel: resident.hostel,
    },
    activeAssignment: a
      ? {
          id: a.id,
          status: a.status,
          monthlyRent: toNumber(a.monthlyRent),
          securityDeposit: toNumber(a.securityDeposit),
          checkInDate: a.checkInDate,
          hostel: a.hostel,
          label: `${a.hostel.name} · Room ${a.room.roomNumber} · Bed ${a.bed.bedNumber}`,
        }
      : null,
    openInvoices: openInvoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      status: i.status,
      dueDate: i.dueDate,
      issueDate: i.issueDate,
      periodStart: i.periodStart,
      total: toNumber(i.total),
      balance: round2(toNumber(i.total) - toNumber(i.amountPaid)),
    })),
    balance,
  };
}

export type ResidentBillingContext = Awaited<ReturnType<typeof getResidentBillingContext>>;

/**
 * Resolve `?invoiceId=` / `?residentId=` for the payment form. Unknown or
 * out-of-scope ids resolve to null (nothing is prefilled, nothing leaks).
 */
export async function getPaymentPrefill(ctx: TenantContext, input: { invoiceId?: string; residentId?: string }) {
  requireAnyPermission(ctx, "payments.manage");
  let residentId = input.residentId;
  let invoiceId: string | null = null;
  if (input.invoiceId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, ...accessWhere(ctx) }, select: { id: true, residentId: true } });
    if (invoice) {
      residentId = invoice.residentId;
      invoiceId = invoice.id;
    }
  }
  if (!residentId) return { resident: null, invoiceId: null };
  const resident = await prisma.resident.findFirst({
    where: { id: residentId, ...accessWhere(ctx) },
    select: { id: true, firstName: true, lastName: true, residentCode: true, hostel: { select: { name: true } } },
  });
  if (!resident) return { resident: null, invoiceId: null };
  return {
    resident: { id: resident.id, name: `${resident.firstName} ${resident.lastName}`.trim(), code: resident.residentCode, hostelName: resident.hostel.name },
    invoiceId,
  };
}
