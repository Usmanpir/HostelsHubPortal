import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { BedStatus, OwnerPayoutStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { todayInTimeZone } from "@/lib/format";
import { nextCode } from "@/lib/sequence";
import { round2, serialize, toNumber } from "@/lib/serialize";
import { actorOf, type TenantContext } from "@/lib/tenant/context";
import { paginate, toPaginated } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import { ownerPropertiesSchema, ownerSchema, type OwnerInput, type OwnerPropertiesInput } from "@/lib/validation/owners";
import { computeOccupancy, type OccupancyStats } from "@/services/hostel/occupancy";
import { lastMonth, periodCovers, thisMonth, toDay } from "./period";
import { accessiblePropertyWhere, ownerWhere, requireOwners } from "./scope";
import { cashByProperty, computeStatementLines, expensesByProperty } from "./statement";

export const OWNER_SORTS = ["name", "ownerCode", "createdAt"] as const;
export type OwnerSort = (typeof OWNER_SORTS)[number];

export type OwnerListFilters = {
  q?: string;
  status?: "ACTIVE" | "ARCHIVED" | "ALL";
  sort?: OwnerSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

type BedCounts = Partial<Record<BedStatus, number>>;

/** Bed counts per (active) property, one grouped query. */
async function bedCountsByProperty(organizationId: string, hostelIds: string[]) {
  const map = new Map<string, BedCounts>();
  if (hostelIds.length === 0) return map;
  const rows = await prisma.bed.groupBy({
    by: ["hostelId", "status"],
    where: { organizationId, hostelId: { in: hostelIds }, archivedAt: null, hostel: { archivedAt: null } },
    _count: { _all: true },
  });
  for (const r of rows) {
    const counts = map.get(r.hostelId) ?? {};
    counts[r.status] = (counts[r.status] ?? 0) + r._count._all;
    map.set(r.hostelId, counts);
  }
  return map;
}

function mergeCounts(maps: (BedCounts | undefined)[]): BedCounts {
  const out: BedCounts = {};
  for (const m of maps) {
    if (!m) continue;
    for (const [status, n] of Object.entries(m) as [BedStatus, number][]) out[status] = (out[status] ?? 0) + n;
  }
  return out;
}

function ownerOrderBy(sort: OwnerSort, dir: "asc" | "desc"): Prisma.PropertyOwnerOrderByWithRelationInput {
  if (sort === "ownerCode") return { ownerCode: dir };
  if (sort === "createdAt") return { createdAt: dir };
  return { name: dir };
}

export async function listOwners(ctx: TenantContext, filters: OwnerListFilters = {}) {
  requireOwners(ctx, "owners.view");
  const { skip, take, page, pageSize } = paginate(filters);
  const status = filters.status ?? "ACTIVE";
  const where: Prisma.PropertyOwnerWhereInput = {
    ...ownerWhere(ctx),
    ...(status === "ACTIVE" ? { archivedAt: null } : status === "ARCHIVED" ? { archivedAt: { not: null } } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { ownerCode: { contains: filters.q, mode: "insensitive" } },
            { phone: { contains: filters.q } },
            { email: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const sort = filters.sort ?? "name";
  const dir = filters.dir ?? (sort === "createdAt" ? "desc" : "asc");

  const [rows, total] = await Promise.all([
    prisma.propertyOwner.findMany({
      where,
      orderBy: [ownerOrderBy(sort, dir), { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        ownerCode: true,
        name: true,
        phone: true,
        email: true,
        commissionPercent: true,
        archivedAt: true,
        createdAt: true,
        properties: { select: { id: true, name: true, code: true, archivedAt: true, managementFeePercent: true } },
      },
    }),
    prisma.propertyOwner.count({ where }),
  ]);

  const today = todayInTimeZone(ctx.organization.timezone);
  const current = thisMonth(today);
  const previous = lastMonth(today);
  const allIds = rows.flatMap((o) => o.properties.map((p) => p.id));
  const activeIds = rows.flatMap((o) => o.properties.filter((p) => !p.archivedAt).map((p) => p.id));

  const [beds, cashNow, cashPrev, spentPrev, paidPrev] = await Promise.all([
    bedCountsByProperty(ctx.organizationId, activeIds),
    cashByProperty(ctx.organizationId, allIds, current),
    cashByProperty(ctx.organizationId, allIds, previous),
    expensesByProperty(ctx.organizationId, allIds, previous),
    rows.length
      ? prisma.ownerPayout.findMany({
          where: {
            organizationId: ctx.organizationId,
            ownerId: { in: rows.map((o) => o.id) },
            status: "PAID",
            periodStart: { lte: new Date(`${previous.to}T00:00:00Z`) },
            periodEnd: { gte: new Date(`${previous.from}T00:00:00Z`) },
          },
          select: { ownerId: true, periodStart: true, periodEnd: true, rentCollected: true, expenses: true, commission: true },
        })
      : Promise.resolve([]),
  ]);

  const items = rows.map((o) => {
    const commissionPercent = toNumber(o.commissionPercent);
    const props = o.properties.map((p) => ({
      ...p,
      managementFeePercent: p.managementFeePercent === null ? null : toNumber(p.managementFeePercent),
    }));
    const active = props.filter((p) => !p.archivedAt);
    const occupancy = computeOccupancy(mergeCounts(active.map((p) => beds.get(p.id))));
    const now = computeStatementLines(props, commissionPercent, cashNow, new Map());
    const prev = computeStatementLines(props, commissionPercent, cashPrev, spentPrev);

    // Balance due for last month = statement net − what was already paid out for it.
    const payouts = paidPrev
      .filter((p) => p.ownerId === o.id)
      .map((p) => ({
        period: { from: toDay(p.periodStart), to: toDay(p.periodEnd) },
        statementNet: round2(toNumber(p.rentCollected) - toNumber(p.expenses) - toNumber(p.commission)),
      }));
    const settled = payouts.some((p) => periodCovers(p.period, previous));
    const paidWithin = round2(
      payouts.filter((p) => periodCovers(previous, p.period)).reduce((s, p) => s + p.statementNet, 0),
    );
    const balanceDue = settled ? 0 : round2(prev.totals.net - paidWithin);

    return {
      id: o.id,
      ownerCode: o.ownerCode,
      name: o.name,
      phone: o.phone,
      email: o.email,
      commissionPercent,
      archivedAt: o.archivedAt,
      createdAt: o.createdAt,
      propertyCount: active.length,
      properties: active.map((p) => ({ id: p.id, name: p.name })),
      occupancy: occupancy.totalBeds > 0 ? occupancy.occupancyRate : null,
      collectedThisMonth: now.totals.collected,
      lastMonthNet: prev.totals.net,
      balanceDue,
    };
  });

  return serialize({
    ...toPaginated(items, total, page, pageSize),
    periods: { current, previous },
  });
}

export type OwnerListItem = Awaited<ReturnType<typeof listOwners>>["items"][number];

/** Owners for selects and filters. */
export async function listOwnerOptions(ctx: TenantContext, options: { includeArchived?: boolean } = {}) {
  requireOwners(ctx, "owners.view");
  return prisma.propertyOwner.findMany({
    where: { ...ownerWhere(ctx), ...(options.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ownerCode: true, archivedAt: true },
  });
}

export async function getOwner(ctx: TenantContext, id: string) {
  requireOwners(ctx, "owners.view");
  const owner = await prisma.propertyOwner.findFirst({
    where: { id, ...ownerWhere(ctx) },
  });
  if (!owner) throw new NotFoundError("Owner");

  const properties = await prisma.hostel.findMany({
    where: { ...accessiblePropertyWhere(ctx), ownerId: owner.id },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      kind: true,
      rentalMode: true,
      status: true,
      archivedAt: true,
      managementFeePercent: true,
    },
  });
  const ids = properties.map((p) => p.id);
  const activeIds = properties.filter((p) => !p.archivedAt).map((p) => p.id);
  const today = todayInTimeZone(ctx.organization.timezone);
  const current = thisMonth(today);

  const [units, beds, cash, recentPayouts, payoutTotals] = await Promise.all([
    activeIds.length
      ? prisma.room.groupBy({
          by: ["hostelId"],
          where: { organizationId: ctx.organizationId, hostelId: { in: activeIds }, archivedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    bedCountsByProperty(ctx.organizationId, activeIds),
    cashByProperty(ctx.organizationId, ids, current),
    prisma.ownerPayout.findMany({
      where: { organizationId: ctx.organizationId, ownerId: owner.id },
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        netPayable: true,
        status: true,
        paidAt: true,
        paymentMethod: true,
        reference: true,
        createdAt: true,
      },
    }),
    prisma.ownerPayout.groupBy({
      by: ["status"],
      where: { organizationId: ctx.organizationId, ownerId: owner.id },
      _sum: { netPayable: true },
      _count: { _all: true },
    }),
  ]);

  const commissionPercent = toNumber(owner.commissionPercent);
  const unitCount = new Map(units.map((u) => [u.hostelId, u._count._all]));
  const propertyRows = properties.map((p) => {
    const fee = p.managementFeePercent === null ? null : toNumber(p.managementFeePercent);
    const occupancy: OccupancyStats | null = p.archivedAt ? null : computeOccupancy(beds.get(p.id) ?? {});
    const c = cash.get(p.id);
    return {
      ...p,
      managementFeePercent: fee,
      effectiveFeePercent: fee ?? commissionPercent,
      units: unitCount.get(p.id) ?? 0,
      occupancy,
      collectedThisMonth: c ? round2(c.payments + c.advances - c.refunds) : 0,
    };
  });
  const overall = computeOccupancy(mergeCounts(activeIds.map((pid) => beds.get(pid))));
  const byStatus = (s: OwnerPayoutStatus) => payoutTotals.find((t) => t.status === s);

  return serialize({
    ...owner,
    commissionPercent,
    properties: propertyRows,
    recentPayouts: recentPayouts.map((p) => ({ ...p, periodStart: toDay(p.periodStart), periodEnd: toDay(p.periodEnd) })),
    stats: {
      propertyCount: activeIds.length,
      units: propertyRows.reduce((s, p) => s + (p.archivedAt ? 0 : p.units), 0),
      occupancy: overall,
      collectedThisMonth: round2(propertyRows.reduce((s, p) => s + p.collectedThisMonth, 0)),
      pendingCount: byStatus("PENDING")?._count._all ?? 0,
      pendingTotal: round2(toNumber(byStatus("PENDING")?._sum.netPayable)),
      paidTotal: round2(toNumber(byStatus("PAID")?._sum.netPayable)),
    },
    period: current,
  });
}

export type OwnerDetail = Awaited<ReturnType<typeof getOwner>>;

async function findOwnerForWrite(ctx: TenantContext, id: string) {
  const owner = await prisma.propertyOwner.findFirst({ where: { id, ...ownerWhere(ctx) } });
  if (!owner) throw new NotFoundError("Owner");
  return owner;
}

export async function createOwner(ctx: TenantContext, raw: OwnerInput) {
  requireOwners(ctx, "owners.manage");
  const input = parseInput(ownerSchema, raw);
  return prisma.$transaction(async (tx) => {
    const ownerCode = await nextCode(tx, ctx.organizationId, "owner", "OWN", 4);
    const owner = await tx.propertyOwner.create({
      data: { ...input, ownerCode, organizationId: ctx.organizationId },
    });
    await audit(actorOf(ctx), { action: "owner.created", entityType: "PropertyOwner", entityId: owner.id, after: owner }, tx);
    return serialize(owner);
  });
}

export async function updateOwner(ctx: TenantContext, id: string, raw: OwnerInput) {
  requireOwners(ctx, "owners.manage");
  const input = parseInput(ownerSchema, raw);
  const before = await findOwnerForWrite(ctx, id);
  if (before.archivedAt) throw new BusinessRuleError("Restore this owner before editing.");
  // Optional fields cleared in the form arrive as undefined; store them as null.
  const data = {
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    idNumber: input.idNumber ?? null,
    address: input.address ?? null,
    bankName: input.bankName ?? null,
    bankAccountTitle: input.bankAccountTitle ?? null,
    bankAccountNumber: input.bankAccountNumber ?? null,
    commissionPercent: input.commissionPercent,
    notes: input.notes ?? null,
  };
  return prisma.$transaction(async (tx) => {
    const owner = await tx.propertyOwner.update({ where: { id }, data });
    await audit(actorOf(ctx), { action: "owner.updated", entityType: "PropertyOwner", entityId: id, before, after: owner }, tx);
    return serialize(owner);
  });
}

/**
 * Soft-archive an owner. Owners with linked properties are refused unless
 * `unlink` is set, in which case those properties are unlinked first.
 * Pending payouts must be paid or cancelled before archiving.
 */
export async function archiveOwner(ctx: TenantContext, id: string, options: { unlink?: boolean } = {}) {
  requireOwners(ctx, "owners.manage");
  const owner = await findOwnerForWrite(ctx, id);
  if (owner.archivedAt) return;
  const [linked, pending] = await Promise.all([
    prisma.hostel.findMany({ where: { organizationId: ctx.organizationId, ownerId: id }, select: { id: true } }),
    prisma.ownerPayout.count({ where: { organizationId: ctx.organizationId, ownerId: id, status: "PENDING" } }),
  ]);
  if (pending > 0) {
    throw new BusinessRuleError(`This owner has ${pending} pending payout(s). Mark them paid or cancel them first.`);
  }
  if (linked.length > 0 && !options.unlink) {
    throw new BusinessRuleError(
      `This owner still has ${linked.length} linked propert${linked.length === 1 ? "y" : "ies"}. Unlink them before archiving.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    if (linked.length) {
      await tx.hostel.updateMany({ where: { organizationId: ctx.organizationId, ownerId: id }, data: { ownerId: null } });
    }
    await tx.propertyOwner.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(
      actorOf(ctx),
      {
        action: "owner.archived",
        entityType: "PropertyOwner",
        entityId: id,
        metadata: { unlinkedPropertyIds: linked.map((h) => h.id) },
      },
      tx,
    );
  });
}

export async function restoreOwner(ctx: TenantContext, id: string) {
  requireOwners(ctx, "owners.manage");
  const owner = await findOwnerForWrite(ctx, id);
  if (!owner.archivedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.propertyOwner.update({ where: { id }, data: { archivedAt: null } });
    await audit(actorOf(ctx), { action: "owner.restored", entityType: "PropertyOwner", entityId: id }, tx);
  });
}

/** Active properties this member can link, with their current owner. */
export async function listLinkableProperties(ctx: TenantContext, ownerId: string) {
  requireOwners(ctx, "owners.manage");
  await findOwnerForWrite(ctx, ownerId);
  const rows = await prisma.hostel.findMany({
    where: { ...accessiblePropertyWhere(ctx), archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      kind: true,
      ownerId: true,
      managementFeePercent: true,
      owner: { select: { id: true, name: true } },
    },
  });
  return serialize(rows.map((r) => ({ ...r, linkedHere: r.ownerId === ownerId })));
}

export type LinkableProperty = Awaited<ReturnType<typeof listLinkableProperties>>[number];

/**
 * Make `hostelIds` exactly the set of active, accessible properties linked to
 * this owner: selected ones are linked (moving them from another owner if
 * needed), previously linked accessible ones that were deselected are unlinked.
 * Archived properties and properties outside the member's access are untouched.
 */
export async function setOwnerProperties(ctx: TenantContext, ownerId: string, raw: OwnerPropertiesInput) {
  requireOwners(ctx, "owners.manage");
  const { hostelIds } = parseInput(ownerPropertiesSchema, raw);
  const owner = await findOwnerForWrite(ctx, ownerId);
  if (owner.archivedAt) throw new BusinessRuleError("Restore this owner before linking properties.");

  const selected = hostelIds.length
    ? await prisma.hostel.findMany({
        where: { ...accessiblePropertyWhere(ctx), id: { in: hostelIds }, archivedAt: null },
        select: { id: true, ownerId: true },
      })
    : [];
  // Another tenant's (or an inaccessible / archived) property: don't reveal which.
  if (selected.length !== hostelIds.length) throw new NotFoundError("Property");

  const currentlyLinked = await prisma.hostel.findMany({
    where: { ...accessiblePropertyWhere(ctx), ownerId, archivedAt: null },
    select: { id: true },
  });
  const wanted = new Set(hostelIds);
  const toLink = selected.filter((h) => h.ownerId !== ownerId);
  const toUnlink = currentlyLinked.filter((h) => !wanted.has(h.id)).map((h) => h.id);

  if (toLink.length === 0 && toUnlink.length === 0) return { linked: 0, unlinked: 0 };

  await prisma.$transaction(async (tx) => {
    if (toLink.length) {
      await tx.hostel.updateMany({
        where: { organizationId: ctx.organizationId, id: { in: toLink.map((h) => h.id) } },
        data: { ownerId },
      });
    }
    if (toUnlink.length) {
      await tx.hostel.updateMany({
        where: { organizationId: ctx.organizationId, id: { in: toUnlink }, ownerId },
        data: { ownerId: null },
      });
    }
    await audit(
      actorOf(ctx),
      {
        action: "owner.properties_updated",
        entityType: "PropertyOwner",
        entityId: ownerId,
        before: { propertyIds: currentlyLinked.map((h) => h.id) },
        after: { propertyIds: hostelIds },
        metadata: {
          linked: toLink.map((h) => ({ id: h.id, previousOwnerId: h.ownerId })),
          unlinked: toUnlink,
        },
      },
      tx,
    );
  });
  return { linked: toLink.length, unlinked: toUnlink.length };
}
