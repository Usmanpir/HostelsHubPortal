import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { actorOf, requirePermission, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import { generateInvoicesSchema, invoiceSchema, type GenerateInvoicesInput } from "@/lib/validation/finance";
import { parseInput } from "@/lib/validation/parse";
import { round2, toNumber } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { notifyResident } from "@/lib/notifications/notify";
import { createInvoiceTx } from "./invoice-service";
import { computeInvoiceTotals } from "./totals";

/** Invoices created per transaction; keeps each transaction short. */
const BATCH_SIZE = 25;

function monthBounds(year: number, month: number) {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0));
  return { periodStart, periodEnd, daysInMonth: periodEnd.getUTCDate() };
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** ACTIVE assignments in scope that were checked in by the end of the month. */
function candidateWhere(ctx: TenantContext, hostelId: string | undefined, periodEnd: Date): Prisma.ResidentAssignmentWhereInput {
  return {
    ...scopedWhere(ctx, hostelId),
    status: "ACTIVE",
    checkInDate: { lte: periodEnd },
    resident: { archivedAt: null },
  };
}

/** Residents that already have a live MONTHLY_RENT invoice for this period. */
function alreadyBilledWhere(organizationId: string, periodStart: Date): Prisma.InvoiceWhereInput {
  return {
    organizationId,
    periodStart,
    status: { not: "CANCELLED" },
    items: { some: { type: "MONTHLY_RENT" } },
  };
}

async function loadCandidates(ctx: TenantContext, input: ReturnType<typeof generateInvoicesSchema.parse>) {
  const { periodStart, periodEnd, daysInMonth } = monthBounds(input.year, input.month);
  const assignments = await prisma.residentAssignment.findMany({
    where: candidateWhere(ctx, input.hostelId, periodEnd),
    orderBy: [{ hostelId: "asc" }, { checkInDate: "asc" }],
    select: {
      id: true,
      residentId: true,
      hostelId: true,
      monthlyRent: true,
      hostel: { select: { name: true, rentDueDay: true } },
      room: { select: { roomNumber: true } },
      bed: { select: { bedNumber: true } },
    },
  });
  const billed = assignments.length
    ? await prisma.invoice.findMany({
        where: { ...alreadyBilledWhere(ctx.organizationId, periodStart), residentId: { in: assignments.map((a) => a.residentId) } },
        select: { residentId: true },
      })
    : [];
  const billedIds = new Set(billed.map((b) => b.residentId));
  const toBill = assignments.filter((a) => !billedIds.has(a.residentId) && toNumber(a.monthlyRent) > 0);
  return {
    periodStart,
    periodEnd,
    daysInMonth,
    total: assignments.length,
    alreadyBilled: assignments.filter((a) => billedIds.has(a.residentId)).length,
    zeroRent: assignments.filter((a) => !billedIds.has(a.residentId) && toNumber(a.monthlyRent) <= 0).length,
    toBill,
  };
}

/** What `generateMonthlyInvoices` would do, without writing anything. */
export async function previewMonthlyInvoices(ctx: TenantContext, raw: GenerateInvoicesInput) {
  requirePermission(ctx, "invoices.manage");
  const input = parseInput(generateInvoicesSchema, raw);
  const c = await loadCandidates(ctx, input);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { taxRate: true } });
  const taxRate = input.applyTax ? toNumber(org.taxRate) : 0;
  const byHostel = new Map<string, { hostelId: string; name: string; count: number; total: number }>();
  let total = 0;
  for (const a of c.toBill) {
    const amount = computeInvoiceTotals([{ quantity: 1, unitPrice: toNumber(a.monthlyRent) }], 0, taxRate).total;
    total = round2(total + amount);
    const row = byHostel.get(a.hostelId) ?? { hostelId: a.hostelId, name: a.hostel.name, count: 0, total: 0 };
    row.count += 1;
    row.total = round2(row.total + amount);
    byHostel.set(a.hostelId, row);
  }
  return {
    period: monthLabel(input.year, input.month),
    toCreate: c.toBill.length,
    total,
    activeAssignments: c.total,
    alreadyBilled: c.alreadyBilled,
    zeroRent: c.zeroRent,
    taxRate,
    hostels: [...byHostel.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Bill every ACTIVE assignment in scope for the month (no proration). Each
 * invoice goes through `createInvoiceTx`; batches are serialized per
 * organization + period with an advisory lock and re-check for existing
 * invoices, so double submits never double-bill.
 */
export async function generateMonthlyInvoices(ctx: TenantContext, raw: GenerateInvoicesInput) {
  requirePermission(ctx, "invoices.manage");
  const input = parseInput(generateInvoicesSchema, raw);
  const c = await loadCandidates(ctx, input);
  const label = monthLabel(input.year, input.month);
  const lockKey = `rent:${ctx.organizationId}:${c.periodStart.toISOString().slice(0, 7)}`;
  const created: { id: string; residentId: string; invoiceNumber: string; total: Prisma.Decimal; dueDate: Date; status: string }[] = [];

  for (let i = 0; i < c.toBill.length; i += BATCH_SIZE) {
    const batch = c.toBill.slice(i, i + BATCH_SIZE);
    const rows = await prisma.$transaction(async (tx) => {
      // $executeRaw: the lock function returns `void`, which $queryRaw can't deserialize.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const nowBilled = await tx.invoice.findMany({
        where: { ...alreadyBilledWhere(ctx.organizationId, c.periodStart), residentId: { in: batch.map((a) => a.residentId) } },
        select: { residentId: true },
      });
      const skip = new Set(nowBilled.map((b) => b.residentId));
      const out = [];
      for (const a of batch) {
        if (skip.has(a.residentId)) continue;
        const dueDay = Math.min(Math.max(a.hostel.rentDueDay, 1), c.daysInMonth);
        const dueDate = new Date(Date.UTC(input.year, input.month - 1, dueDay));
        const invoice = await createInvoiceTx(
          tx,
          ctx,
          invoiceSchema.parse({
            residentId: a.residentId,
            assignmentId: a.id,
            issueDate: c.periodStart,
            dueDate,
            periodStart: c.periodStart,
            periodEnd: c.periodEnd,
            items: [
              {
                type: "MONTHLY_RENT",
                description: `Monthly rent · ${label} · Room ${a.room.roomNumber}, Bed ${a.bed.bedNumber}`,
                quantity: 1,
                unitPrice: toNumber(a.monthlyRent),
              },
            ],
            discount: 0,
            applyTax: input.applyTax,
            status: "PENDING",
          }),
        );
        skip.add(a.residentId);
        out.push(invoice);
      }
      return out;
    }, { timeout: 30_000, maxWait: 10_000 });
    created.push(...rows);
  }

  const skipped = c.total - created.length;
  await audit(actorOf(ctx), {
    action: "invoice.bulk_generated",
    entityType: "Invoice",
    metadata: {
      period: c.periodStart.toISOString().slice(0, 7),
      hostelId: input.hostelId ?? ctx.activeHostelId ?? null,
      created: created.length,
      skipped,
      total: round2(created.reduce((s, inv) => s + toNumber(inv.total), 0)),
    },
    after: { invoiceIds: created.map((inv) => inv.id) },
  });

  // Notify after commit, a few at a time.
  for (let i = 0; i < created.length; i += 10) {
    await Promise.allSettled(
      created.slice(i, i + 10).map((inv) =>
        notifyResident(ctx.organizationId, inv.residentId, {
          type: "INVOICE_CREATED",
          title: `Rent invoice ${inv.invoiceNumber}`,
          body: `${label} rent: ${formatMoney(toNumber(inv.total), ctx.organization.currency)} due ${inv.dueDate.toISOString().slice(0, 10)}`,
          link: `/portal/invoices/${inv.id}`,
        }),
      ),
    );
  }
  return { created: created.length, skipped };
}
