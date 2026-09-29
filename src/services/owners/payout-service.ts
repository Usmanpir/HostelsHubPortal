import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { OwnerPayoutStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import { EXPORT_ROW_LIMIT } from "@/lib/export";
import { dateOnly, formatMoney, todayInTimeZone } from "@/lib/format";
import { notifyMembers } from "@/lib/notifications/notify";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { actorOf, type TenantContext } from "@/lib/tenant/context";
import { paginate, toPaginated } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import {
  cancelPayoutSchema,
  createPayoutSchema,
  payPayoutSchema,
  type CancelPayoutInput,
  type CreatePayoutInput,
  type PayPayoutInput,
} from "@/lib/validation/owners";
import { periodLabel, toDay, type Period } from "./period";
import { accessiblePropertyWhere, ownerWhere, requireOwners } from "./scope";
import { cashByProperty, computeStatementLines, expensesByProperty } from "./statement";

export const PAYOUT_SORTS = ["periodStart", "netPayable", "createdAt", "paidAt"] as const;
export type PayoutSort = (typeof PAYOUT_SORTS)[number];

export type PayoutListFilters = {
  q?: string;
  status?: OwnerPayoutStatus;
  ownerId?: string;
  /** Payouts whose period overlaps [from, to]. */
  from?: Date;
  to?: Date;
  sort?: PayoutSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

const payoutSelect = {
  id: true,
  ownerId: true,
  periodStart: true,
  periodEnd: true,
  rentCollected: true,
  expenses: true,
  commission: true,
  adjustments: true,
  netPayable: true,
  status: true,
  paidAt: true,
  paymentMethod: true,
  reference: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, ownerCode: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.OwnerPayoutSelect;

type PayoutRow = Prisma.OwnerPayoutGetPayload<{ select: typeof payoutSelect }>;

function shape(p: PayoutRow) {
  return serialize({
    ...p,
    periodStart: toDay(p.periodStart),
    periodEnd: toDay(p.periodEnd),
    paidAt: p.paidAt ? toDay(p.paidAt) : null,
    createdBy: p.createdBy?.name ?? null,
  });
}

export type PayoutItem = ReturnType<typeof shape>;

function listWhere(ctx: TenantContext, f: PayoutListFilters): Prisma.OwnerPayoutWhereInput {
  return {
    organizationId: ctx.organizationId,
    owner: ownerWhere(ctx),
    ...(f.ownerId ? { ownerId: f.ownerId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.to ? { periodStart: { lte: f.to } } : {}),
    ...(f.from ? { periodEnd: { gte: f.from } } : {}),
    ...(f.q
      ? {
          OR: [
            { reference: { contains: f.q, mode: "insensitive" } },
            { owner: { name: { contains: f.q, mode: "insensitive" } } },
            { owner: { ownerCode: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

function orderBy(f: PayoutListFilters): Prisma.OwnerPayoutOrderByWithRelationInput[] {
  const dir = f.dir ?? "desc";
  const primary: Prisma.OwnerPayoutOrderByWithRelationInput =
    f.sort === "netPayable"
      ? { netPayable: dir }
      : f.sort === "createdAt"
        ? { createdAt: dir }
        : f.sort === "paidAt"
          ? { paidAt: { sort: dir, nulls: "last" } }
          : { periodStart: dir };
  return [primary, { createdAt: "desc" }, { id: "asc" }];
}

export async function listPayouts(ctx: TenantContext, filters: PayoutListFilters = {}) {
  requireOwners(ctx, "owners.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const where = listWhere(ctx, filters);
  // Status totals ignore the status filter so the summary tiles stay meaningful.
  const summaryWhere = listWhere(ctx, { ...filters, status: undefined });
  const [rows, total, summary] = await Promise.all([
    prisma.ownerPayout.findMany({ where, orderBy: orderBy(filters), skip, take, select: payoutSelect }),
    prisma.ownerPayout.count({ where }),
    prisma.ownerPayout.groupBy({ by: ["status"], where: summaryWhere, _sum: { netPayable: true }, _count: { _all: true } }),
  ]);
  const totals = Object.fromEntries(
    (["PENDING", "PAID", "CANCELLED"] as const).map((s) => {
      const row = summary.find((r) => r.status === s);
      return [s, { count: row?._count._all ?? 0, amount: round2(toNumber(row?._sum.netPayable)) }];
    }),
  ) as Record<OwnerPayoutStatus, { count: number; amount: number }>;
  return { ...toPaginated(rows.map(shape), total, page, pageSize), totals };
}

export async function listPayoutsForExport(ctx: TenantContext, filters: PayoutListFilters = {}) {
  requireOwners(ctx, "owners.view");
  const rows = await prisma.ownerPayout.findMany({
    where: listWhere(ctx, filters),
    orderBy: orderBy(filters),
    take: EXPORT_ROW_LIMIT,
    select: payoutSelect,
  });
  return rows.map(shape);
}

export async function getPayout(ctx: TenantContext, id: string) {
  requireOwners(ctx, "owners.view");
  const payout = await prisma.ownerPayout.findFirst({
    where: { id, organizationId: ctx.organizationId, owner: ownerWhere(ctx) },
    select: payoutSelect,
  });
  if (!payout) throw new NotFoundError("Payout");
  return shape(payout);
}

/** Statement totals for a payout snapshot (same math as the statement page). */
async function statementTotals(ctx: TenantContext, owner: { id: string; commissionPercent: Prisma.Decimal }, period: Period) {
  const properties = await prisma.hostel.findMany({
    where: { ...accessiblePropertyWhere(ctx), ownerId: owner.id },
    select: { id: true, name: true, code: true, archivedAt: true, managementFeePercent: true },
  });
  const ids = properties.map((p) => p.id);
  const [cash, spent] = await Promise.all([
    cashByProperty(ctx.organizationId, ids, period),
    expensesByProperty(ctx.organizationId, ids, period),
  ]);
  const { totals } = computeStatementLines(
    properties.map((p) => ({ ...p, managementFeePercent: p.managementFeePercent === null ? null : toNumber(p.managementFeePercent) })),
    toNumber(owner.commissionPercent),
    cash,
    spent,
  );
  return { totals, propertyCount: properties.length };
}

function payoutNotification(ctx: TenantContext, verb: string, p: { ownerName: string; netPayable: number; period: Period }) {
  return {
    type: "OWNER_PAYOUT" as const,
    title: `Owner payout ${verb}`,
    body: `${p.ownerName} · ${formatMoney(p.netPayable, ctx.organization.currency, ctx.organization.locale)} for ${periodLabel(p.period, ctx.organization.locale)}`,
    link: "/owners/payouts",
  };
}

/**
 * Snapshot a statement into a PENDING payout. Refuses when a PENDING or PAID
 * payout for the same owner overlaps the period; the owner row is locked so
 * two concurrent requests cannot both pass that check.
 */
export async function createPayout(ctx: TenantContext, raw: CreatePayoutInput) {
  requireOwners(ctx, "owners.manage");
  const input = parseInput(createPayoutSchema, raw);
  const owner = await prisma.propertyOwner.findFirst({
    where: { id: input.ownerId, ...ownerWhere(ctx) },
    select: { id: true, name: true, commissionPercent: true, archivedAt: true },
  });
  if (!owner) throw new NotFoundError("Owner");
  if (owner.archivedAt) throw new BusinessRuleError("Restore this owner before creating a payout.");
  const today = todayInTimeZone(ctx.organization.timezone);
  if (input.to > today) throw new BusinessRuleError("A payout period can't end in the future.");

  const period: Period = { from: input.from, to: input.to };
  const { totals, propertyCount } = await statementTotals(ctx, owner, period);
  if (propertyCount === 0) throw new BusinessRuleError("Link at least one property to this owner before creating a payout.");
  const netPayable = round2(totals.net + input.adjustments);
  const periodStart = dateOnly(input.from);
  const periodEnd = dateOnly(input.to);

  const payout = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PropertyOwner" WHERE "id" = ${owner.id} FOR UPDATE`;
    const clash = await tx.ownerPayout.findFirst({
      where: {
        organizationId: ctx.organizationId,
        ownerId: owner.id,
        status: { in: ["PENDING", "PAID"] },
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      select: { periodStart: true, periodEnd: true, status: true },
    });
    if (clash) {
      const label = periodLabel({ from: toDay(clash.periodStart), to: toDay(clash.periodEnd) }, ctx.organization.locale);
      throw new ConflictError(
        `A ${clash.status === "PAID" ? "paid" : "pending"} payout for ${label} already overlaps this period. Cancel it or choose different dates.`,
      );
    }
    const created = await tx.ownerPayout.create({
      data: {
        organizationId: ctx.organizationId,
        ownerId: owner.id,
        periodStart,
        periodEnd,
        rentCollected: totals.collected,
        expenses: totals.expenses,
        commission: totals.fee,
        adjustments: input.adjustments,
        netPayable,
        notes: input.notes ?? null,
        createdById: ctx.userId,
      },
      select: payoutSelect,
    });
    await audit(
      actorOf(ctx),
      { action: "owner_payout.created", entityType: "OwnerPayout", entityId: created.id, after: created, metadata: { statement: totals } },
      tx,
    );
    return created;
  });

  await notifyMembers(ctx.organizationId, "owners.manage", null, payoutNotification(ctx, "created", { ownerName: owner.name, netPayable, period }), {
    excludeUserId: ctx.userId,
  });
  return shape(payout);
}

async function findPendingPayout(ctx: TenantContext, id: string) {
  const payout = await prisma.ownerPayout.findFirst({
    where: { id, organizationId: ctx.organizationId, owner: ownerWhere(ctx) },
    select: payoutSelect,
  });
  if (!payout) throw new NotFoundError("Payout");
  if (payout.status !== "PENDING") {
    throw new BusinessRuleError(`This payout is already ${payout.status === "PAID" ? "paid" : "cancelled"}.`);
  }
  return payout;
}

const appendNote = (existing: string | null, note: string | undefined) =>
  note ? (existing ? `${existing}\n${note}` : note).slice(0, 2000) : existing;

export async function markPayoutPaid(ctx: TenantContext, id: string, raw: PayPayoutInput) {
  requireOwners(ctx, "owners.manage");
  const input = parseInput(payPayoutSchema, raw);
  const before = await findPendingPayout(ctx, id);
  if (input.paidAt > todayInTimeZone(ctx.organization.timezone)) {
    throw new BusinessRuleError("The payment date can't be in the future.");
  }
  const after = await prisma.$transaction(async (tx) => {
    // Conditional update: a concurrent pay/cancel makes this a no-op.
    const { count } = await tx.ownerPayout.updateMany({
      where: { id, organizationId: ctx.organizationId, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: dateOnly(input.paidAt),
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: appendNote(before.notes, input.notes),
      },
    });
    if (count === 0) throw new ConflictError("This payout was changed by someone else. Refresh and try again.");
    const updated = await tx.ownerPayout.findUniqueOrThrow({ where: { id }, select: payoutSelect });
    await audit(actorOf(ctx), { action: "owner_payout.paid", entityType: "OwnerPayout", entityId: id, before, after: updated }, tx);
    return updated;
  });
  await notifyMembers(
    ctx.organizationId,
    "owners.manage",
    null,
    payoutNotification(ctx, "paid", {
      ownerName: after.owner.name,
      netPayable: toNumber(after.netPayable),
      period: { from: toDay(after.periodStart), to: toDay(after.periodEnd) },
    }),
    { excludeUserId: ctx.userId },
  );
  return shape(after);
}

export async function cancelPayout(ctx: TenantContext, id: string, raw: CancelPayoutInput = {}) {
  requireOwners(ctx, "owners.manage");
  const input = parseInput(cancelPayoutSchema, raw);
  const before = await findPendingPayout(ctx, id);
  const after = await prisma.$transaction(async (tx) => {
    const { count } = await tx.ownerPayout.updateMany({
      where: { id, organizationId: ctx.organizationId, status: "PENDING" },
      data: { status: "CANCELLED", notes: appendNote(before.notes, input.reason ? `Cancelled: ${input.reason}` : undefined) },
    });
    if (count === 0) throw new ConflictError("This payout was changed by someone else. Refresh and try again.");
    const updated = await tx.ownerPayout.findUniqueOrThrow({ where: { id }, select: payoutSelect });
    await audit(
      actorOf(ctx),
      { action: "owner_payout.cancelled", entityType: "OwnerPayout", entityId: id, before, after: updated, metadata: { reason: input.reason ?? null } },
      tx,
    );
    return updated;
  });
  await notifyMembers(
    ctx.organizationId,
    "owners.manage",
    null,
    payoutNotification(ctx, "cancelled", {
      ownerName: after.owner.name,
      netPayable: toNumber(after.netPayable),
      period: { from: toDay(after.periodStart), to: toDay(after.periodEnd) },
    }),
    { excludeUserId: ctx.userId },
  );
  return shape(after);
}
