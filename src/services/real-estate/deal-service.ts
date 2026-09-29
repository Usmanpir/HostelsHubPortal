import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { DealStage } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { actorOf, can, canAny, hasHostelAccess, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import {
  computeCommission,
  DEAL_STAGES,
  DEAL_TRANSITIONS,
  dealCommissionSchema,
  dealFiltersSchema,
  dealSchema,
  dealStageSchema,
  OPEN_DEAL_STAGES,
  type DealCommissionInput,
  type DealFilters,
  type DealInput,
  type DealStageInput,
} from "@/lib/validation/real-estate";
import { nextCode } from "@/lib/sequence";
import { serialize, toNumber } from "@/lib/serialize";
import { dateOnly } from "@/lib/format";
import { dealStageLabels } from "@/config/real-estate-labels";
import { getEntityTimeline } from "@/services/operations/shared";
import { assertAgentMember, assertDealerEnabled, orgToday, periodStarts } from "./shared";
import { applyLeadStage } from "./lead-service";
import { applyListingStatus } from "./listing-service";

/** Mirrors EXPORT_ROW_LIMIT in src/lib/export.ts (not imported to keep exceljs out of action bundles). */
const EXPORT_LIMIT = 10_000;
const ENTITY = "Deal";
const OPEN_STAGES: DealStage[] = [...OPEN_DEAL_STAGES];

const listInclude = {
  listing: { select: { id: true, code: true, title: true } },
  lead: { select: { id: true, code: true, name: true } },
  agent: { select: { id: true, name: true } },
} satisfies Prisma.DealInclude;

type ParsedFilters = ReturnType<typeof dealFiltersSchema.parse>;

function buildWhere(ctx: TenantContext, f: ParsedFilters): Prisma.DealWhereInput {
  return {
    AND: [
      { organizationId: ctx.organizationId },
      f.stage ? { stage: f.stage } : {},
      f.state === "open" ? { stage: { in: OPEN_STAGES } } : f.state === "closed" ? { stage: { in: ["CLOSED_WON", "CLOSED_LOST"] } } : {},
      f.type ? { type: f.type } : {},
      f.commission === "paid"
        ? { stage: "CLOSED_WON", commissionPaidAt: { not: null } }
        : f.commission === "unpaid"
          ? { stage: "CLOSED_WON", commissionPaidAt: null, commissionAmount: { gt: 0 } }
          : {},
      f.mine ? { agentUserId: ctx.userId } : f.agentUserId ? { agentUserId: f.agentUserId } : {},
      f.q
        ? {
            OR: [
              { code: { contains: f.q, mode: "insensitive" } },
              { clientName: { contains: f.q, mode: "insensitive" } },
              { listing: { title: { contains: f.q, mode: "insensitive" } } },
              { listing: { code: { contains: f.q, mode: "insensitive" } } },
              { lead: { name: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
}

function orderBy(f: { sort?: string; dir?: "asc" | "desc" }): Prisma.DealOrderByWithRelationInput[] {
  const dir = f.dir ?? "desc";
  switch (f.sort) {
    case "agreedAmount":
      return [{ agreedAmount: dir }];
    case "code":
      return [{ code: dir }];
    case "stage":
      return [{ stage: dir }, { createdAt: "desc" }];
    case "expectedCloseDate":
      return [{ expectedCloseDate: { sort: dir, nulls: "last" } }];
    case "createdAt":
      return [{ createdAt: dir }];
    default:
      return [{ createdAt: "desc" }];
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listDeals(ctx: TenantContext, raw: DealFilters = {}) {
  requirePermission(ctx, "deals.view");
  assertDealerEnabled(ctx);
  const filters = parseInput(dealFiltersSchema, raw);
  const where = buildWhere(ctx, filters);
  const { skip, take, page, pageSize } = paginate(filters);
  const [rows, total] = await Promise.all([
    prisma.deal.findMany({ where, skip, take, orderBy: orderBy(filters), include: listInclude }),
    prisma.deal.count({ where }),
  ]);
  return serialize(toPaginated(rows, total, page, pageSize));
}

/** Pipeline columns with per-stage totals. */
export async function listDealBoard(ctx: TenantContext, raw: DealFilters = {}, perColumn = 50) {
  requirePermission(ctx, "deals.view");
  assertDealerEnabled(ctx);
  const filters = parseInput(dealFiltersSchema, { ...raw, stage: undefined, state: undefined });
  const base = buildWhere(ctx, filters);
  const columns = await Promise.all(
    DEAL_STAGES.map(async (stage) => {
      const where: Prisma.DealWhereInput = { AND: [base, { stage }] };
      const closed = !OPEN_STAGES.includes(stage);
      const [items, agg] = await Promise.all([
        prisma.deal.findMany({
          where,
          take: closed ? Math.min(perColumn, 20) : perColumn,
          orderBy: closed ? [{ closedAt: "desc" }] : [{ expectedCloseDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
          include: listInclude,
        }),
        prisma.deal.aggregate({ where, _count: { _all: true }, _sum: { agreedAmount: true } }),
      ]);
      return { stage, items, total: agg._count._all, value: toNumber(agg._sum.agreedAmount) };
    }),
  );
  return serialize(columns);
}

export async function exportDeals(ctx: TenantContext, raw: DealFilters = {}) {
  requirePermission(ctx, "deals.view");
  assertDealerEnabled(ctx);
  const filters = parseInput(dealFiltersSchema, { ...raw, page: 1, pageSize: 100 });
  const rows = await prisma.deal.findMany({ where: buildWhere(ctx, filters), orderBy: orderBy(filters), take: EXPORT_LIMIT, include: listInclude });
  return serialize(rows);
}

/** Pipeline value, deals won this month and commission earned / unpaid. */
export async function getDealSummary(ctx: TenantContext) {
  requirePermission(ctx, "deals.view");
  assertDealerEnabled(ctx);
  const { monthStart } = periodStarts(ctx);
  const org = { organizationId: ctx.organizationId };
  const [pipeline, wonMonth, earned, unpaid] = await Promise.all([
    prisma.deal.aggregate({ where: { ...org, stage: { in: OPEN_STAGES } }, _count: { _all: true }, _sum: { agreedAmount: true, commissionAmount: true } }),
    prisma.deal.aggregate({ where: { ...org, stage: "CLOSED_WON", closedAt: { gte: monthStart } }, _count: { _all: true }, _sum: { agreedAmount: true, commissionAmount: true } }),
    prisma.deal.aggregate({ where: { ...org, stage: "CLOSED_WON" }, _sum: { commissionAmount: true } }),
    prisma.deal.aggregate({ where: { ...org, stage: "CLOSED_WON", commissionPaidAt: null }, _count: { _all: true }, _sum: { commissionAmount: true } }),
  ]);
  return {
    pipelineCount: pipeline._count._all,
    pipelineValue: toNumber(pipeline._sum.agreedAmount),
    pipelineCommission: toNumber(pipeline._sum.commissionAmount),
    wonThisMonthCount: wonMonth._count._all,
    wonThisMonthValue: toNumber(wonMonth._sum.agreedAmount),
    commissionThisMonth: toNumber(wonMonth._sum.commissionAmount),
    commissionEarned: toNumber(earned._sum.commissionAmount),
    commissionUnpaid: toNumber(unpaid._sum.commissionAmount),
    commissionUnpaidCount: unpaid._count._all,
  };
}

export async function getDeal(ctx: TenantContext, id: string) {
  requirePermission(ctx, "deals.view");
  assertDealerEnabled(ctx);
  const deal = await prisma.deal.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      agent: { select: { id: true, name: true, email: true } },
      lead: { select: { id: true, code: true, name: true, phone: true, email: true, stage: true } },
      listing: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          purpose: true,
          price: true,
          isPublished: true,
          hostelId: true,
          roomId: true,
          hostel: { select: { id: true, name: true } },
          room: { select: { id: true, roomNumber: true } },
        },
      },
    },
  });
  if (!deal) throw new NotFoundError("Deal");
  const canManage = can(ctx, "deals.manage");
  const timeline = await getEntityTimeline(ctx, ENTITY, deal.id);

  // A rent deal on one of our own units can go straight into tenant onboarding.
  let moveIn: { bedId: string; canCreateTenant: boolean; canCheckIn: boolean } | null = null;
  const unit = deal.listing;
  if (
    deal.type === "RENT" &&
    unit?.roomId &&
    unit.hostelId &&
    canAny(ctx, "residents.manage", "assignments.manage") &&
    hasHostelAccess(ctx, unit.hostelId)
  ) {
    const beds = await prisma.bed.findMany({
      where: { organizationId: ctx.organizationId, roomId: unit.roomId, archivedAt: null },
      orderBy: { bedNumber: "asc" },
      select: { id: true, status: true },
    });
    const bed = beds.find((b) => b.status === "AVAILABLE") ?? beds[0];
    if (bed) moveIn = { bedId: bed.id, canCreateTenant: can(ctx, "residents.manage"), canCheckIn: can(ctx, "assignments.manage") };
  }

  return serialize({
    ...deal,
    timeline,
    moveIn,
    access: {
      canManage,
      allowedStages: canManage ? DEAL_TRANSITIONS[deal.stage] : [],
      canEdit: canManage && OPEN_STAGES.includes(deal.stage),
      canMarkCommission: canManage && deal.stage === "CLOSED_WON",
      canSeeLead: can(ctx, "leads.view"),
      canSeeListing: can(ctx, "listings.view"),
    },
  });
}

/** Defaults for "New deal" when started from a lead and/or listing. */
export async function getDealPrefill(ctx: TenantContext, source: { leadId?: string | null; listingId?: string | null }) {
  requirePermission(ctx, "deals.manage");
  assertDealerEnabled(ctx);
  const lead = source.leadId
    ? await prisma.lead.findFirst({
        where: { id: source.leadId, organizationId: ctx.organizationId, archivedAt: null },
        select: { id: true, name: true, interest: true, listingId: true, assignedUserId: true },
      })
    : null;
  const listingId = source.listingId ?? lead?.listingId ?? null;
  const listing = listingId
    ? await prisma.listing.findFirst({
        where: { id: listingId, organizationId: ctx.organizationId },
        select: { id: true, purpose: true, price: true, agentUserId: true },
      })
    : null;
  return {
    leadId: lead?.id ?? "",
    listingId: listing?.id ?? "",
    type: listing?.purpose ?? lead?.interest ?? "SALE",
    clientName: lead?.name ?? "",
    agreedAmount: listing ? toNumber(listing.price) : undefined,
    agentUserId: lead?.assignedUserId ?? listing?.agentUserId ?? (canAny(ctx, "leads.manage", "listings.manage") ? ctx.userId : ""),
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

async function loadDeal(ctx: TenantContext, id: string) {
  const deal = await prisma.deal.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!deal) throw new NotFoundError("Deal");
  return deal;
}

async function resolveRefs(ctx: TenantContext, input: ReturnType<typeof dealSchema.parse>, current?: { leadId: string | null; listingId: string | null; agentUserId: string | null }) {
  const lead =
    input.leadId && input.leadId !== current?.leadId
      ? await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: ctx.organizationId, archivedAt: null } })
      : null;
  if (input.leadId && input.leadId !== current?.leadId && !lead) throw new NotFoundError("Lead");
  if (lead && (lead.stage === "WON" || lead.stage === "LOST")) {
    throw new BusinessRuleError("This lead is closed. Reopen it before starting a deal.");
  }
  if (input.listingId && input.listingId !== current?.listingId) {
    const listing = await prisma.listing.findFirst({
      where: { id: input.listingId, organizationId: ctx.organizationId },
      select: { id: true, status: true, purpose: true },
    });
    if (!listing) throw new NotFoundError("Listing");
    if (listing.status === "SOLD" || listing.status === "RENTED" || listing.status === "ARCHIVED") {
      throw new BusinessRuleError("This listing is no longer available.");
    }
    if (listing.purpose !== input.type) {
      throw new ValidationError("Please check the highlighted fields.", {
        type: [`This listing is ${listing.purpose === "SALE" ? "for sale" : "for rent"}; the deal type must match.`],
      });
    }
  }
  if (input.agentUserId && input.agentUserId !== current?.agentUserId) await assertAgentMember(ctx, input.agentUserId);
  return { lead };
}

function commissionFor(input: ReturnType<typeof dealSchema.parse>) {
  return input.commissionAmount ?? computeCommission(input.agreedAmount, input.commissionPercent);
}

function money(d: { agreedAmount: unknown; commissionPercent: unknown; commissionAmount: unknown; stage: string; commissionPaidAt: Date | null; closedAt: Date | null }) {
  return {
    stage: d.stage,
    agreedAmount: d.agreedAmount,
    commissionPercent: d.commissionPercent,
    commissionAmount: d.commissionAmount,
    commissionPaidAt: d.commissionPaidAt,
    closedAt: d.closedAt,
  };
}

export async function createDeal(ctx: TenantContext, raw: DealInput) {
  requirePermission(ctx, "deals.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(dealSchema, raw);
  const { lead } = await resolveRefs(ctx, input);
  const commissionAmount = commissionFor(input);

  const deal = await prisma.$transaction(async (tx) => {
    const code = await nextCode(tx, ctx.organizationId, "deal", "DEAL", 5);
    const created = await tx.deal.create({
      data: {
        organizationId: ctx.organizationId,
        code,
        type: input.type,
        listingId: input.listingId ?? null,
        leadId: input.leadId ?? null,
        clientName: input.clientName,
        agreedAmount: input.agreedAmount,
        commissionPercent: input.commissionPercent,
        commissionAmount,
        agentUserId: input.agentUserId ?? null,
        expectedCloseDate: input.expectedCloseDate ? dateOnly(input.expectedCloseDate) : null,
        notes: input.notes ?? null,
      },
    });
    if (lead && (lead.stage === "NEW" || lead.stage === "CONTACTED" || lead.stage === "VIEWING")) {
      await applyLeadStage(tx, ctx, lead, "NEGOTIATION", { reason: `deal ${code} started` });
    }
    await audit(actorOf(ctx), { action: "deal.created", entityType: ENTITY, entityId: created.id, after: { code, type: created.type, clientName: created.clientName, ...money(created) } }, tx);
    return created;
  });
  return serialize(deal);
}

export async function updateDeal(ctx: TenantContext, id: string, raw: DealInput) {
  requirePermission(ctx, "deals.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(dealSchema, raw);
  const before = await loadDeal(ctx, id);
  if (!OPEN_STAGES.includes(before.stage)) throw new BusinessRuleError("Closed deals can't be edited. Reopen the deal first.");
  await resolveRefs(ctx, input, before);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.deal.update({
      where: { id },
      data: {
        type: input.type,
        listingId: input.listingId ?? null,
        leadId: input.leadId ?? null,
        clientName: input.clientName,
        agreedAmount: input.agreedAmount,
        commissionPercent: input.commissionPercent,
        commissionAmount: commissionFor(input),
        agentUserId: input.agentUserId ?? null,
        expectedCloseDate: input.expectedCloseDate ? dateOnly(input.expectedCloseDate) : null,
        notes: input.notes ?? null,
      },
    });
    await audit(
      actorOf(ctx),
      {
        action: "deal.updated",
        entityType: ENTITY,
        entityId: id,
        before: { ...money(before), type: before.type, listingId: before.listingId, leadId: before.leadId, agentUserId: before.agentUserId, clientName: before.clientName },
        after: { ...money(row), type: row.type, listingId: row.listingId, leadId: row.leadId, agentUserId: row.agentUserId, clientName: row.clientName },
      },
      tx,
    );
    return row;
  });
  return serialize(updated);
}

/**
 * Move a deal through OPEN → AGREEMENT → CLOSED_WON / CLOSED_LOST.
 *  - AGREEMENT puts an active listing under offer.
 *  - CLOSED_WON marks the lead WON and the listing SOLD (sale) or RENTED (rent), unpublishing it.
 *  - CLOSED_LOST releases an under-offer listing when no other deal holds it.
 */
export async function changeDealStage(ctx: TenantContext, id: string, raw: DealStageInput) {
  requirePermission(ctx, "deals.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(dealStageSchema, raw);
  const before = await loadDeal(ctx, id);
  if (input.stage === before.stage) return serialize(before);
  if (!DEAL_TRANSITIONS[before.stage].includes(input.stage)) {
    throw new BusinessRuleError(`A deal that is ${dealStageLabels[before.stage].toLowerCase()} can't be moved to ${dealStageLabels[input.stage].toLowerCase()}.`);
  }
  const listing = before.listingId ? await prisma.listing.findFirst({ where: { id: before.listingId, organizationId: ctx.organizationId } }) : null;
  const lead = before.leadId ? await prisma.lead.findFirst({ where: { id: before.leadId, organizationId: ctx.organizationId } }) : null;
  if (input.stage === "CLOSED_WON" && listing && (listing.status === "SOLD" || listing.status === "RENTED")) {
    throw new BusinessRuleError(`This listing is already marked ${listing.status === "SOLD" ? "sold" : "rented"}.`);
  }
  const closing = input.stage === "CLOSED_WON" || input.stage === "CLOSED_LOST";

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.deal.update({
      where: { id },
      data: {
        stage: input.stage,
        closedAt: closing ? new Date() : null,
        ...(input.note ? { notes: before.notes ? `${before.notes}\n\n${input.note}` : input.note } : {}),
      },
    });
    const meta = { dealId: id, dealCode: before.code };

    if (input.stage === "CLOSED_WON") {
      if (lead && lead.stage !== "WON" && !lead.archivedAt) {
        await applyLeadStage(tx, ctx, lead, "WON", { reason: `deal ${before.code} closed` });
      }
      if (listing) {
        await applyListingStatus(tx, ctx, listing, before.type === "SALE" ? "SOLD" : "RENTED", meta);
      }
    } else if (input.stage === "AGREEMENT") {
      if (listing?.status === "ACTIVE") await applyListingStatus(tx, ctx, listing, "UNDER_OFFER", meta);
    } else if (listing?.status === "UNDER_OFFER" && (input.stage === "CLOSED_LOST" || input.stage === "OPEN")) {
      const holding = await tx.deal.count({ where: { listingId: listing.id, stage: "AGREEMENT", id: { not: id } } });
      if (holding === 0) await applyListingStatus(tx, ctx, listing, "ACTIVE", meta);
    }

    await audit(
      actorOf(ctx),
      { action: "deal.stage_changed", entityType: ENTITY, entityId: id, before: money(before), after: money(row), metadata: input.note ? { note: input.note } : undefined },
      tx,
    );
    return row;
  });
  return serialize(updated);
}

export async function setDealCommissionPaid(ctx: TenantContext, id: string, raw: DealCommissionInput) {
  requirePermission(ctx, "deals.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(dealCommissionSchema, raw);
  const before = await loadDeal(ctx, id);
  if (input.paid && before.stage !== "CLOSED_WON") throw new BusinessRuleError("Commission can only be marked paid on a won deal.");
  const paidAt = input.paid ? dateOnly(input.paidOn ?? orgToday(ctx)) : null;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.deal.update({ where: { id }, data: { commissionPaidAt: paidAt } });
    await audit(
      actorOf(ctx),
      { action: input.paid ? "deal.commission_paid" : "deal.commission_unpaid", entityType: ENTITY, entityId: id, before: money(before), after: money(row) },
      tx,
    );
    return row;
  });
  return serialize(updated);
}
