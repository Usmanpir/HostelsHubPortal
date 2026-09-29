import { prisma, type DbClient } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { LeadActivityType, LeadStage } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { actorOf, can, requireAnyPermission, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { paginate, toPaginated } from "@/lib/validation/common";
import {
  LEAD_STAGES,
  leadActivitySchema,
  leadAssignSchema,
  leadDuplicateSchema,
  leadFiltersSchema,
  leadFollowUpSchema,
  leadSchema,
  leadStageSchema,
  OPEN_LEAD_STAGES,
  phoneDigits,
  type LeadActivityInput,
  type LeadAssignInput,
  type LeadDuplicateInput,
  type LeadFilters,
  type LeadFollowUpInput,
  type LeadInput,
  type LeadStageInput,
} from "@/lib/validation/real-estate";
import { nextCode } from "@/lib/sequence";
import { serialize } from "@/lib/serialize";
import { dateOnly } from "@/lib/format";
import { notifyUsers } from "@/lib/notifications/notify";
import { leadStageLabels } from "@/config/real-estate-labels";
import { assertAgentMember, assertDealerEnabled, followUpToday, periodStarts } from "./shared";

/** Mirrors EXPORT_ROW_LIMIT in src/lib/export.ts (not imported to keep exceljs out of action bundles). */
const EXPORT_LIMIT = 10_000;
const ENTITY = "Lead";
const OPEN_STAGES: LeadStage[] = [...OPEN_LEAD_STAGES];
const CONTACT_TYPES: LeadActivityType[] = ["CALL", "WHATSAPP", "EMAIL", "MEETING"];

const listInclude = {
  listing: { select: { id: true, code: true, title: true } },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { viewings: true, activities: true } },
} satisfies Prisma.LeadInclude;

function link(id: string) {
  return `/leads/${id}`;
}

type ParsedFilters = ReturnType<typeof leadFiltersSchema.parse>;

function buildWhere(ctx: TenantContext, f: ParsedFilters): Prisma.LeadWhereInput {
  const today = followUpToday(ctx);
  const followUp: Prisma.LeadWhereInput =
    f.followUp === "today"
      ? { nextFollowUpAt: today, stage: { in: OPEN_STAGES } }
      : f.followUp === "overdue"
        ? { nextFollowUpAt: { lt: today }, stage: { in: OPEN_STAGES } }
        : f.followUp === "due"
          ? { nextFollowUpAt: { lte: today }, stage: { in: OPEN_STAGES } }
          : {};
  return {
    AND: [
      { organizationId: ctx.organizationId, archivedAt: null },
      f.stage ? { stage: f.stage } : {},
      f.state === "open" ? { stage: { in: OPEN_STAGES } } : f.state === "closed" ? { stage: { in: ["WON", "LOST"] } } : {},
      f.source ? { source: f.source } : {},
      f.mine ? { assignedUserId: ctx.userId } : f.assignedUserId ? { assignedUserId: f.assignedUserId } : {},
      f.listingId ? { listingId: f.listingId } : {},
      followUp,
      f.q
        ? {
            OR: [
              { name: { contains: f.q, mode: "insensitive" } },
              { code: { contains: f.q, mode: "insensitive" } },
              { phone: { contains: f.q } },
              { email: { contains: f.q, mode: "insensitive" } },
              { preferredLocation: { contains: f.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
}

function orderBy(f: { sort?: string; dir?: "asc" | "desc" }): Prisma.LeadOrderByWithRelationInput[] {
  const dir = f.dir ?? "desc";
  switch (f.sort) {
    case "name":
      return [{ name: dir }];
    case "code":
      return [{ code: dir }];
    case "stage":
      return [{ stage: dir }, { createdAt: "desc" }];
    case "nextFollowUpAt":
      return [{ nextFollowUpAt: { sort: dir, nulls: "last" } }, { createdAt: "desc" }];
    case "createdAt":
      return [{ createdAt: dir }];
    default:
      return [{ createdAt: "desc" }];
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listLeads(ctx: TenantContext, raw: LeadFilters = {}) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  const filters = parseInput(leadFiltersSchema, raw);
  const where = buildWhere(ctx, filters);
  const { skip, take, page, pageSize } = paginate(filters);
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where, skip, take, orderBy: orderBy(filters), include: listInclude }),
    prisma.lead.count({ where }),
  ]);
  return serialize(toPaginated(rows, total, page, pageSize));
}

/** Kanban board: up to `perColumn` leads per stage (closed stages show the most recent). */
export async function listLeadBoard(ctx: TenantContext, raw: LeadFilters = {}, perColumn = 50) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  const filters = parseInput(leadFiltersSchema, { ...raw, stage: undefined, state: undefined });
  const base = buildWhere(ctx, filters);
  const columns = await Promise.all(
    LEAD_STAGES.map(async (stage) => {
      const where: Prisma.LeadWhereInput = { AND: [base, { stage }] };
      const closed = stage === "WON" || stage === "LOST";
      const [items, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          take: closed ? Math.min(perColumn, 20) : perColumn,
          orderBy: closed ? [{ updatedAt: "desc" }] : [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
          include: listInclude,
        }),
        prisma.lead.count({ where }),
      ]);
      return { stage, items, total };
    }),
  );
  return serialize(columns);
}

export async function exportLeads(ctx: TenantContext, raw: LeadFilters = {}) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  const filters = parseInput(leadFiltersSchema, { ...raw, page: 1, pageSize: 100 });
  const rows = await prisma.lead.findMany({
    where: buildWhere(ctx, filters),
    orderBy: orderBy(filters),
    take: EXPORT_LIMIT,
    include: listInclude,
  });
  return serialize(rows);
}

/** Counts for the leads page header. */
export async function getLeadSummary(ctx: TenantContext) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  const today = followUpToday(ctx);
  const { weekStart } = periodStarts(ctx);
  const base: Prisma.LeadWhereInput = { organizationId: ctx.organizationId, archivedAt: null };
  const open: Prisma.LeadWhereInput = { ...base, stage: { in: OPEN_STAGES } };
  const [openCount, newThisWeek, dueToday, overdue, mine] = await Promise.all([
    prisma.lead.count({ where: open }),
    prisma.lead.count({ where: { ...base, createdAt: { gte: weekStart } } }),
    prisma.lead.count({ where: { ...open, nextFollowUpAt: today } }),
    prisma.lead.count({ where: { ...open, nextFollowUpAt: { lt: today } } }),
    prisma.lead.count({ where: { ...open, assignedUserId: ctx.userId } }),
  ]);
  return { open: openCount, newThisWeek, dueToday, overdue, mine };
}

/** Open leads for viewing / deal pickers. */
export async function listLeadOptions(ctx: TenantContext, options: { includeId?: string | null } = {}) {
  requireAnyPermission(ctx, "leads.view", "deals.manage");
  assertDealerEnabled(ctx);
  const rows = await prisma.lead.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      OR: [{ stage: { in: OPEN_STAGES } }, ...(options.includeId ? [{ id: options.includeId }] : [])],
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: { id: true, code: true, name: true, phone: true, stage: true, listingId: true, assignedUserId: true, interest: true },
  });
  return rows;
}

/**
 * Open leads that share the phone number (last 10 digits) or email address.
 * Used to warn about duplicates while a lead is being entered.
 */
export async function findDuplicateLeads(ctx: TenantContext, raw: LeadDuplicateInput) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  const input = parseInput(leadDuplicateSchema, raw);
  const digits = phoneDigits(input.phone).slice(-10);
  const email = input.email?.toLowerCase();
  const or: Prisma.LeadWhereInput[] = [];
  if (digits.length >= 7) or.push({ phone: { contains: digits.slice(-4) } });
  if (email && email.includes("@")) or.push({ email: { equals: email, mode: "insensitive" } });
  if (or.length === 0) return [];
  const candidates = await prisma.lead.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      stage: { in: OPEN_STAGES },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: or,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, code: true, name: true, phone: true, email: true, stage: true, assignedTo: { select: { name: true } } },
  });
  return candidates
    .filter(
      (c) =>
        (email && c.email?.toLowerCase() === email) ||
        (digits.length >= 7 && phoneDigits(c.phone).slice(-10) === digits),
    )
    .slice(0, 5);
}

export async function getLead(ctx: TenantContext, id: string) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  const canDeals = can(ctx, "deals.view");
  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: ctx.organizationId, archivedAt: null },
    include: {
      listing: { select: { id: true, code: true, title: true, purpose: true, price: true, status: true, city: true, locality: true, coverFileId: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, type: true, body: true, createdAt: true, user: { select: { id: true, name: true } } },
      },
      viewings: {
        orderBy: { scheduledAt: "desc" },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          feedback: true,
          listing: { select: { id: true, code: true, title: true } },
          agent: { select: { id: true, name: true } },
        },
      },
      deals: {
        orderBy: { createdAt: "desc" },
        take: canDeals ? 50 : 0,
        select: { id: true, code: true, stage: true, type: true, agreedAmount: true, createdAt: true },
      },
    },
  });
  if (!lead) throw new NotFoundError("Lead");
  const duplicates = await findDuplicateLeads(ctx, { phone: lead.phone ?? undefined, email: lead.email ?? undefined, excludeId: lead.id });
  const canManage = can(ctx, "leads.manage");
  return serialize({
    ...lead,
    duplicates,
    access: {
      canManage,
      canSeeDeals: canDeals,
      canCreateDeal: can(ctx, "deals.manage"),
      canSeeListings: can(ctx, "listings.view"),
      isOpen: OPEN_STAGES.includes(lead.stage),
    },
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

async function loadLead(ctx: TenantContext, id: string, db: DbClient = prisma) {
  const lead = await db.lead.findFirst({ where: { id, organizationId: ctx.organizationId, archivedAt: null } });
  if (!lead) throw new NotFoundError("Lead");
  return lead;
}

async function assertListingForLead(ctx: TenantContext, listingId: string) {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, organizationId: ctx.organizationId },
    select: { id: true, status: true },
  });
  if (!listing) throw new NotFoundError("Listing");
  return listing;
}

/**
 * Change a lead's stage inside a transaction: records a STAGE_CHANGE activity
 * and an audit entry. Used by the lead screen, viewings and deals.
 */
export async function applyLeadStage(
  tx: DbClient,
  ctx: TenantContext,
  lead: { id: string; stage: LeadStage; lostReason: string | null },
  stage: LeadStage,
  options: { lostReason?: string | null; reason?: string } = {},
) {
  const lostReason = stage === "LOST" ? (options.lostReason ?? lead.lostReason ?? null) : null;
  const row = await tx.lead.update({ where: { id: lead.id }, data: { stage, lostReason } });
  const detail = stage === "LOST" && lostReason ? ` — ${lostReason}` : options.reason ? ` (${options.reason})` : "";
  await tx.leadActivity.create({
    data: {
      organizationId: ctx.organizationId,
      leadId: lead.id,
      userId: ctx.userId,
      type: "STAGE_CHANGE",
      body: `${leadStageLabels[lead.stage]} → ${leadStageLabels[stage]}${detail}`,
    },
  });
  await audit(
    actorOf(ctx),
    {
      action: "lead.stage_changed",
      entityType: ENTITY,
      entityId: lead.id,
      before: { stage: lead.stage, lostReason: lead.lostReason },
      after: { stage: row.stage, lostReason: row.lostReason },
      metadata: options.reason ? { reason: options.reason } : undefined,
    },
    tx,
  );
  return row;
}

export async function createLead(ctx: TenantContext, raw: LeadInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(leadSchema, raw);
  if (input.listingId) await assertListingForLead(ctx, input.listingId);
  const assignee = input.assignedUserId ? await assertAgentMember(ctx, input.assignedUserId, "assignedUserId") : null;

  const lead = await prisma.$transaction(async (tx) => {
    const code = await nextCode(tx, ctx.organizationId, "lead", "LEAD", 5);
    const created = await tx.lead.create({
      data: {
        organizationId: ctx.organizationId,
        code,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        source: input.source,
        interest: input.interest ?? null,
        listingId: input.listingId ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        preferredLocation: input.preferredLocation ?? null,
        message: input.message ?? null,
        notes: input.notes ?? null,
        assignedUserId: assignee?.id ?? null,
        nextFollowUpAt: input.nextFollowUpAt ? dateOnly(input.nextFollowUpAt) : null,
      },
    });
    await audit(
      actorOf(ctx),
      { action: "lead.created", entityType: ENTITY, entityId: created.id, after: { code, name: created.name, source: created.source, assignedTo: assignee?.name ?? null } },
      tx,
    );
    return created;
  });

  if (assignee && assignee.id !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [assignee.id], {
      type: "LEAD_RECEIVED",
      title: `New lead assigned to you: ${lead.name}`,
      body: `${lead.code}${lead.phone ? ` · ${lead.phone}` : ""}`,
      link: link(lead.id),
    });
  }
  return serialize(lead);
}

export async function updateLead(ctx: TenantContext, id: string, raw: LeadInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(leadSchema, raw);
  const before = await loadLead(ctx, id);
  if (input.listingId && input.listingId !== before.listingId) await assertListingForLead(ctx, input.listingId);
  const assigneeChanged = (input.assignedUserId ?? null) !== before.assignedUserId;
  const assignee = input.assignedUserId && assigneeChanged ? await assertAgentMember(ctx, input.assignedUserId, "assignedUserId") : null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.lead.update({
      where: { id },
      data: {
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        source: input.source,
        interest: input.interest ?? null,
        listingId: input.listingId ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        preferredLocation: input.preferredLocation ?? null,
        message: input.message ?? null,
        notes: input.notes ?? null,
        assignedUserId: input.assignedUserId ?? null,
        nextFollowUpAt: input.nextFollowUpAt ? dateOnly(input.nextFollowUpAt) : null,
      },
    });
    const pick = (l: typeof before) => ({
      name: l.name,
      phone: l.phone,
      email: l.email,
      source: l.source,
      listingId: l.listingId,
      budgetMin: l.budgetMin,
      budgetMax: l.budgetMax,
      assignedUserId: l.assignedUserId,
      nextFollowUpAt: l.nextFollowUpAt,
    });
    await audit(actorOf(ctx), { action: "lead.updated", entityType: ENTITY, entityId: id, before: pick(before), after: pick(row) }, tx);
    return row;
  });

  if (assignee && assignee.id !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [assignee.id], {
      type: "LEAD_RECEIVED",
      title: `Lead assigned to you: ${updated.name}`,
      body: updated.code,
      link: link(id),
    });
  }
  return serialize(updated);
}

export async function changeLeadStage(ctx: TenantContext, id: string, raw: LeadStageInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(leadStageSchema, raw);
  const before = await loadLead(ctx, id);
  if (input.stage === before.stage && (input.stage !== "LOST" || input.lostReason === before.lostReason)) {
    return serialize(before);
  }
  const updated = await prisma.$transaction((tx) => applyLeadStage(tx, ctx, before, input.stage, { lostReason: input.lostReason }));
  return serialize(updated);
}

export async function assignLead(ctx: TenantContext, id: string, raw: LeadAssignInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(leadAssignSchema, raw);
  const before = await loadLead(ctx, id);
  if ((input.assignedUserId ?? null) === before.assignedUserId) return serialize(before);
  const assignee = input.assignedUserId ? await assertAgentMember(ctx, input.assignedUserId, "assignedUserId") : null;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.lead.update({ where: { id }, data: { assignedUserId: assignee?.id ?? null } });
    await tx.leadActivity.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: id,
        userId: ctx.userId,
        type: "NOTE",
        body: assignee ? `Assigned to ${assignee.name}` : "Unassigned",
      },
    });
    await audit(
      actorOf(ctx),
      { action: assignee ? "lead.assigned" : "lead.unassigned", entityType: ENTITY, entityId: id, before: { assignedUserId: before.assignedUserId }, after: { assignedUserId: row.assignedUserId } },
      tx,
    );
    return row;
  });
  if (assignee && assignee.id !== ctx.userId) {
    await notifyUsers(ctx.organizationId, [assignee.id], {
      type: "LEAD_RECEIVED",
      title: `Lead assigned to you: ${updated.name}`,
      body: updated.code,
      link: link(id),
    });
  }
  return serialize(updated);
}

export async function setLeadFollowUp(ctx: TenantContext, id: string, raw: LeadFollowUpInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(leadFollowUpSchema, raw);
  const before = await loadLead(ctx, id);
  const next = input.nextFollowUpAt ? dateOnly(input.nextFollowUpAt) : null;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.lead.update({ where: { id }, data: { nextFollowUpAt: next } });
    await audit(actorOf(ctx), { action: "lead.follow_up_set", entityType: ENTITY, entityId: id, before: { nextFollowUpAt: before.nextFollowUpAt }, after: { nextFollowUpAt: row.nextFollowUpAt } }, tx);
    return row;
  });
  return serialize(updated);
}

/**
 * Log a note / call / WhatsApp / email / meeting. Contact activities update
 * "last contacted" and move a NEW lead to CONTACTED automatically.
 */
export async function addLeadActivity(ctx: TenantContext, id: string, raw: LeadActivityInput) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const input = parseInput(leadActivitySchema, raw);
  const lead = await loadLead(ctx, id);
  const contact = CONTACT_TYPES.includes(input.type);
  const activity = await prisma.$transaction(async (tx) => {
    const row = await tx.leadActivity.create({
      data: { organizationId: ctx.organizationId, leadId: id, userId: ctx.userId, type: input.type, body: input.body },
    });
    if (contact) await tx.lead.update({ where: { id }, data: { lastContactedAt: row.createdAt } });
    if (contact && lead.stage === "NEW") await applyLeadStage(tx, ctx, lead, "CONTACTED", { reason: "first contact logged" });
    return row;
  });
  return serialize(activity);
}

export async function listLeadActivities(ctx: TenantContext, id: string) {
  requirePermission(ctx, "leads.view");
  assertDealerEnabled(ctx);
  await loadLead(ctx, id);
  const rows = await prisma.leadActivity.findMany({
    where: { leadId: id, organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, type: true, body: true, createdAt: true, user: { select: { id: true, name: true } } },
  });
  return rows;
}

/** Soft delete. Leads with deals keep their history; archived leads drop out of lists. */
export async function archiveLead(ctx: TenantContext, id: string) {
  requirePermission(ctx, "leads.manage");
  assertDealerEnabled(ctx);
  const lead = await loadLead(ctx, id);
  const openDeals = await prisma.deal.count({ where: { leadId: id, stage: { in: ["OPEN", "AGREEMENT"] } } });
  if (openDeals > 0) throw new BusinessRuleError("This lead has an open deal. Close the deal before archiving the lead.");
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data: { archivedAt: new Date() } });
    await tx.viewing.updateMany({ where: { leadId: id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
    await audit(actorOf(ctx), { action: "lead.archived", entityType: ENTITY, entityId: id, before: { stage: lead.stage } }, tx);
  });
}
